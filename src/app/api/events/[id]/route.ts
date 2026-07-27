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

  // Notify Dimitri when Theresa proposes / RSVPs to something.
  if (who === 'theresa' && 'rsvp_theresa' in patch && data) {
    const verb = body.rsvp_theresa === 'going' ? 'will zu' : 'hat Interesse an'
    await supabase.from('notifications').insert({
      message: `Theresa ${verb}: ${data.title} ♡`,
      kind: data.category === 'city' ? 'proposal' : 'rsvp',
      event_id: data.id,
    })
  }

  return Response.json(data)
}