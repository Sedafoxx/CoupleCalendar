import { supabase } from '@/lib/supabase'
import { viennaToday } from '@/lib/event-utils'
import { ensureBothConfirmedMemory } from '@/lib/memory-utils'
import { NextRequest } from 'next/server'

// Daily Vercel cron.
//  1. Archives past city-discovery events so they stop cluttering views.
//  2. Promotes past, both-confirmed personal events into memories
//     (history → memory). Recurring events never expire; window/sleepover
//     expire on their end_date.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const today = viennaToday()

  // Only archive city-discovery events that are past their date.
  // Personal events (category = 'personal') stay visible forever as memories.
  const { data, error } = await supabase
    .from('events')
    .update({ archived: true })
    .eq('archived', false)
    .eq('category', 'city')
    .lt('date', today)
    .select('id')

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  // History → memory: any past personal event where BOTH said 'going' but has
  // no memory yet gets a placeholder memory. Idempotent per-event.
  const { data: pastConfirmed, error: memError } = await supabase
    .from('events')
    .select('id, title')
    .eq('category', 'personal')
    .eq('rsvp_dimitri', 'going')
    .eq('rsvp_theresa', 'going')
    .lt('date', today)

  if (memError) {
    return Response.json({ ok: false, error: memError.message }, { status: 500 })
  }

  let memoriesCreated = 0
  if (pastConfirmed) {
    for (const ev of pastConfirmed) {
      const created = await ensureBothConfirmedMemory(ev)
      if (created) memoriesCreated++
    }
  }

  return Response.json({ ok: true, archived: data?.length ?? 0, memoriesCreated })
}