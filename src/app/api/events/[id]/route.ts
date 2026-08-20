import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { isTheresaAuthed } from '@/lib/theresa-auth'
import { syncConfirmedEventToGoogle } from '@/lib/google-sync'
import { ensureBothConfirmedMemory } from '@/lib/memory-utils'
import { viennaToday } from '@/lib/event-utils'
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
  // Symmetric RSVP: either partner may set either person's RSVP field, so
  // Dimi can confirm for Theresa and Theresa can confirm for Dimi.
  if ('rsvp_dimitri' in body) patch.rsvp_dimitri = body.rsvp_dimitri
  if ('rsvp_theresa' in body) patch.rsvp_theresa = body.rsvp_theresa
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

  // Both RSVP 'going' → it's a confirmed date. Notify both + sync to Google.
  // A memory is ONLY created once the event date has passed (history), not
  // the moment the second person confirms. See ensureBothConfirmedMemory.
  if (data && data.rsvp_dimitri === 'going' && data.rsvp_theresa === 'going') {
    // Notify both that it's a date — but only once per event (idempotent),
    // so toggling RSVP back and forth doesn't spam notifications.
    const { data: existingNotif } = await supabase
      .from('notifications')
      .select('id')
      .eq('event_id', data.id)
      .eq('kind', 'event')
      .like('message', '💕 Date bestätigt:%')
      .limit(1)

    if (!existingNotif || existingNotif.length === 0) {
      await supabase.from('notifications').insert({
        message: `💕 Date bestätigt: ${data.title} ♡`,
        kind: 'event',
        event_id: data.id,
      })
    }

    // If this event is already in the past (history), promote it to a memory
    // immediately. Future events wait for the date to pass, then the daily
    // cron (and this same check) creates the memory.
    if (data.date < viennaToday()) {
      await ensureBothConfirmedMemory(data)
    }

    // Both confirmed → also write the date to Dimitri's Google Calendar.
    // Idempotent (title+day match) and best-effort; never blocks the response.
    await syncConfirmedEventToGoogle(data)
  }

  return Response.json(data)
}