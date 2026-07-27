import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { isTheresaAuthed } from '@/lib/theresa-auth'
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

/**
 * Identify the caller: 'dimitri' (Google OAuth), 'theresa' (PIN cookie), or null.
 */
async function whoIs(req: NextRequest): Promise<'dimitri' | 'theresa' | null> {
  const session = await getServerSession(authOptions)
  if (session) return 'dimitri'
  if (isTheresaAuthed(req)) return 'theresa'
  return null
}

/**
 * GET /api/memories
 *
 * Query params:
 *   ?event_id=xxx  — memories for a specific event
 *   ?recent=true    — latest memories with event title/date (for timeline feed)
 *   &limit=20       — max results (default 50)
 */
export async function GET(req: NextRequest) {
  const who = await whoIs(req)
  if (!who) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id')
  const recent = searchParams.get('recent')
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 100)

  if (eventId) {
    // Memories for a specific event
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json(data)
  }

  if (recent === 'true') {
    // Recent memories with event details joined — for the timeline feed
    const { data, error } = await supabase
      .from('memories')
      .select('*, events!inner(title, date)')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) return Response.json({ error: error.message }, { status: 500 })

    // Flatten the joined data into the Memory shape
    const flat = data.map((m) => ({
      id: m.id,
      event_id: m.event_id,
      captured_by: m.captured_by,
      photo_front: m.photo_front,
      photo_back: m.photo_back,
      caption: m.caption,
      created_at: m.created_at,
      event_title: (m.events as { title: string } | null)?.title ?? undefined,
      event_date: (m.events as { date: string } | null)?.date ?? undefined,
    }))

    return Response.json(flat)
  }

  // Default: all memories
  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

/**
 * POST /api/memories
 *
 * Body: FormData
 *   - photo_front (File) — selfie/front camera image
 *   - photo_back  (File) — main/rear camera image
 *   - event_id    (string) — UUID of the event
 *   - caption     (string, optional)
 */
export async function POST(req: NextRequest) {
  const who = await whoIs(req)
  if (!who) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const photoFront = formData.get('photo_front') as File | null
  const photoBack = formData.get('photo_back') as File | null
  const eventId = formData.get('event_id') as string | null
  const caption = formData.get('caption') as string | null

  if (!photoFront || !photoBack) {
    return Response.json({ error: 'Both photo_front and photo_back are required' }, { status: 400 })
  }
  if (!eventId) {
    return Response.json({ error: 'event_id is required' }, { status: 400 })
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

  try {
    // Upload front photo to Supabase Storage
    const frontBytes = await photoFront.arrayBuffer()
    const frontExt = photoFront.name.split('.').pop() || 'jpg'
    const frontPath = `${who}/${eventId}/${uuid()}-front.${frontExt}`

    const { data: frontUpload, error: frontError } = await supabase.storage
      .from('memory-photos')
      .upload(frontPath, frontBytes, {
        contentType: photoFront.type || 'image/jpeg',
        upsert: false,
      })

    if (frontError) throw new Error(`Front photo upload failed: ${frontError.message}`)

    // Upload back photo to Supabase Storage
    const backBytes = await photoBack.arrayBuffer()
    const backExt = photoBack.name.split('.').pop() || 'jpg'
    const backPath = `${who}/${eventId}/${uuid()}-back.${backExt}`

    const { data: backUpload, error: backError } = await supabase.storage
      .from('memory-photos')
      .upload(backPath, backBytes, {
        contentType: photoBack.type || 'image/jpeg',
        upsert: false,
      })

    if (backError) throw new Error(`Back photo upload failed: ${backError.message}`)

    // Get public URLs
    const { data: { publicUrl: frontUrl } } = supabase.storage
      .from('memory-photos')
      .getPublicUrl(frontUpload.path)

    const { data: { publicUrl: backUrl } } = supabase.storage
      .from('memory-photos')
      .getPublicUrl(backUpload.path)

    // Insert memory record
    const { data: memory, error: insertError } = await supabase
      .from('memories')
      .insert({
        event_id: eventId,
        captured_by: who,
        photo_front: frontUrl,
        photo_back: backUrl,
        caption: caption || null,
      })
      .select()
      .single()

    if (insertError) throw new Error(`Memory insert failed: ${insertError.message}`)

    return Response.json(memory, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
