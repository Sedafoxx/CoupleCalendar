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
  return Response.json({ ok: true, archived: data?.length ?? 0 })
}