import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { isTheresaAuthed } from '@/lib/theresa-auth'
import { extractYouTubeId, youtubeWatchUrl } from '@/lib/youtube'
import { NextRequest } from 'next/server'

/** Edge-safe UUID v4 — uses only crypto.getRandomValues */
function uuid(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

/** Identify the caller: 'dimitri' (Google OAuth), 'theresa' (PIN cookie), or null. */
async function whoIs(req: NextRequest): Promise<'dimitri' | 'theresa' | null> {
  const session = await getServerSession(authOptions)
  if (session) return 'dimitri'
  if (isTheresaAuthed(req)) return 'theresa'
  return null
}

/**
 * GET /api/event-media
 *
 * Query params:
 *   ?event_id=xxx  — media for a specific event
 *   ?recent=true    — recent media with event title/date (timeline / calendar covers)
 *   &limit=20       — max results (default 50)
 */
export async function GET(req: NextRequest) {
  const who = await whoIs(req)
  if (!who) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id')
  const recent = searchParams.get('recent')
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200)

  if (eventId) {
    const { data, error } = await supabase
      .from('event_media')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json(data)
  }

  if (recent === 'true') {
    // Recent media with event details joined — for feed/calendar covers
    const { data, error } = await supabase
      .from('event_media')
      .select('*, events!inner(title, date)')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return Response.json({ error: error.message }, { status: 500 })

    const flat = data.map((m) => ({
      id: m.id,
      event_id: m.event_id,
      kind: m.kind,
      url: m.url,
      youtube_url: m.youtube_url,
      caption: m.caption,
      added_by: m.added_by,
      created_at: m.created_at,
      event_title: (m.events as { title: string } | null)?.title ?? undefined,
      event_date: (m.events as { date: string } | null)?.date ?? undefined,
    }))

    return Response.json(flat)
  }

  const { data, error } = await supabase
    .from('event_media')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

/**
 * POST /api/event-media
 *
 * Body: FormData
 *   - event_id  (string, required)
 *   - kind      ('photo' | 'video' | 'youtube' | 'note', required)
 *   - files     (File[], optional) — one or more photos/videos to upload
 *   - youtube_url (string, optional) — for kind='youtube'
 *   - caption   (string, optional) — used for notes and as a per-item caption
 *
 * For 'photo'/'video' the caller may send multiple files; each becomes its own
 * event_media row so the response is always an array of created items.
 */
export async function POST(req: NextRequest) {
  const who = await whoIs(req)
  if (!who) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const eventId = formData.get('event_id') as string | null
  const kind = (formData.get('kind') as string | null) ?? 'photo'
  const caption = (formData.get('caption') as string | null) || null
  const youtubeUrl = (formData.get('youtube_url') as string | null) || null

  if (!eventId) return Response.json({ error: 'event_id is required' }, { status: 400 })
  if (!['photo', 'video', 'youtube', 'note'].includes(kind)) {
    return Response.json({ error: 'Invalid kind' }, { status: 400 })
  }

  // Verify the event exists
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .single()

  if (eventError || !event) {
    return Response.json({ error: 'Event not found' }, { status: 404 })
  }

  const created: unknown[] = []

  try {
    // Collect files. Support both `files` (multiple) and single-file fields.
    const files = formData.getAll('files') as File[]

    if (kind === 'youtube') {
      if (!youtubeUrl) return Response.json({ error: 'youtube_url is required' }, { status: 400 })
      const ytId = extractYouTubeId(youtubeUrl)
      if (!ytId) return Response.json({ error: 'Not a valid YouTube URL' }, { status: 400 })
      const { data: row, error } = await supabase
        .from('event_media')
        .insert({
          event_id: eventId,
          kind: 'youtube',
          youtube_url: youtubeWatchUrl(ytId),
          caption,
          added_by: who,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      created.push(row)
      return Response.json(created, { status: 201 })
    }

    if (kind === 'note') {
      if (!caption) return Response.json({ error: 'caption is required for notes' }, { status: 400 })
      const { data: row, error } = await supabase
        .from('event_media')
        .insert({ event_id: eventId, kind: 'note', caption, added_by: who })
        .select()
        .single()
      if (error) throw new Error(error.message)
      created.push(row)
      return Response.json(created, { status: 201 })
    }

    // photo / video: at least one file required
    if (files.length === 0) {
      return Response.json({ error: `At least one file required for ${kind}` }, { status: 400 })
    }

    for (const file of files) {
      const bytes = await file.arrayBuffer()
      const ext = file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')
      const path = `${who}/${eventId}/${uuid()}.${ext}`

      const { data: upload, error: uploadError } = await supabase.storage
        .from('memory-photos')
        .upload(path, bytes, { contentType: file.type || 'application/octet-stream', upsert: false })

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

      const { data: { publicUrl } } = supabase.storage
        .from('memory-photos')
        .getPublicUrl(upload.path)

      const { data: row, error } = await supabase
        .from('event_media')
        .insert({
          event_id: eventId,
          kind,
          url: publicUrl,
          caption,
          added_by: who,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      created.push(row)
    }

    return Response.json(created, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
