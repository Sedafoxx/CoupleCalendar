import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { isTheresaAuthed } from '@/lib/theresa-auth'
import type { NextRequest } from 'next/server'

type Who = 'dimitri' | 'theresa'

async function whoIs(req: NextRequest): Promise<Who | null> {
  const session = await getServerSession(authOptions)
  if (session) return 'dimitri'
  if (isTheresaAuthed(req)) return 'theresa'
  return null
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<'/api/events/[id]'>
) {
  if (!await whoIs(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return new Response(null, { status: 204 })
}

// Partial updates: { joinable?, rsvp_dimitri?, rsvp_theresa?, status?, category? }
export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<'/api/events/[id]'>
) {
  const who = await whoIs(req)
  if (!who) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json()

  const patch: Record<string, unknown> = {}
  if (typeof body.joinable === 'boolean') patch.joinable = body.joinable
  if ('status' in body) patch.status = body.status
  if ('category' in body) patch.category = body.category
  // Each partner may only set their own RSVP.
  if (who === 'dimitri' && 'rsvp_dimitri' in body) patch.rsvp_dimitri = body.rsvp_dimitri
  if (who === 'theresa' && 'rsvp_theresa' in body) patch.rsvp_theresa = body.rsvp_theresa
  // Editable fields for event detail
  if ('title' in body && body.title) patch.title = body.title
  if ('date' in body && body.date) patch.date = body.date
  if ('start_time' in body) patch.start_time = body.start_time || null
  if ('end_time' in body) patch.end_time = body.end_time || null
  if ('location' in body) patch.location = body.location || ''

  if (!Object.keys(patch).length) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('events')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // If the event title changed, keep auto-created memory captions in sync.
  if ('title' in patch && typeof patch.title === 'string' && data) {
    await supabase
      .from('memories')
      .update({ caption: `💕 Beide zu: ${patch.title}` })
      .eq('event_id', data.id)
      .like('caption', '💕 Beide zu: %')
  }

  // Notify Dimitri when Theresa proposes / RSVPs to something.
  if (who === 'theresa' && 'rsvp_theresa' in patch && data) {
    const verb = body.rsvp_theresa === 'going' ? 'will zu' : 'hat Interesse an'
    await supabase.from('notifications').insert({
      message: `Theresa ${verb}: ${data.title} ♡`,
      kind: data.category === 'city' ? 'proposal' : 'rsvp',
      event_id: data.id,
    })
  }

  // Both RSVP 'going' → auto-create a memory placeholder + notify both.
  if (data && data.rsvp_dimitri === 'going' && data.rsvp_theresa === 'going') {
    // Check if a memory already exists for this event (don't double-create)
    const { data: existingMems } = await supabase
      .from('memories')
      .select('id')
      .eq('event_id', data.id)
      .limit(1)

    if (!existingMems || existingMems.length === 0) {
      // Create a note-style memory as a placeholder
      const emptyPixel = new Uint8Array([71,73,70,56,57,97,1,0,1,0,128,0,0,255,255,255,0,0,0,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59])
      const bucket = supabase.storage.from('memory-photos')
      const placeholderPath = `system/placeholder-${data.id}.gif`

      // Upload placeholder if not exists
      const { data: existingFile } = await bucket.list('system')
      const needsUpload = !existingFile?.some(f => f.name === `placeholder-${data.id}.gif`)
      if (needsUpload) {
        await bucket.upload(placeholderPath, emptyPixel, { contentType: 'image/gif', upsert: true })
      }

      const { data: { publicUrl: placeholderUrl } } = bucket.getPublicUrl(placeholderPath)

      await supabase.from('memories').insert({
        event_id: data.id,
        captured_by: 'dimitri',
        photo_front: placeholderUrl,
        photo_back: placeholderUrl,
        caption: `💕 Beide zu: ${data.title}`,
      })

      // Notify both that it's a date!
      await supabase.from('notifications').insert({
        message: `💕 Date bestätigt: ${data.title} ♡`,
        kind: 'event',
        event_id: data.id,
      })
    }
  }

  return Response.json(data)
}