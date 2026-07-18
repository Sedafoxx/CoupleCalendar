import { supabase } from '@/lib/supabase'
import { viennaToday } from '@/lib/event-utils'
import { NextRequest } from 'next/server'

// Daily Vercel cron. Archives past events so they stop cluttering both views.
// Recurring events never expire; window/sleepover expire on their end_date.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const today = viennaToday()

  // Single/city events: past once their date < today.
  const { data, error } = await supabase
    .from('events')
    .update({ archived: true })
    .eq('archived', false)
    .neq('type', 'recurring')
    .lt('date', today)
    .is('end_date', null)
    .select('id')

  // Window/sleepover with an end_date: past once end_date < today.
  const { data: ranged, error: err2 } = await supabase
    .from('events')
    .update({ archived: true })
    .eq('archived', false)
    .neq('type', 'recurring')
    .lt('end_date', today)
    .select('id')

  if (error || err2) {
    return Response.json({ ok: false, error: (error ?? err2)?.message }, { status: 500 })
  }
  return Response.json({ ok: true, archived: (data?.length ?? 0) + (ranged?.length ?? 0) })
}