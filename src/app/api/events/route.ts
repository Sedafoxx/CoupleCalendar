import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { viennaToday } from '@/lib/event-utils'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const today = viennaToday()
  const { searchParams } = new URL(req.url)
  const includePast = searchParams.get('past') === 'true'

  let query = supabase
    .from('events')
    .select('*')
    .eq('archived', false)

  if (!includePast) {
    // Default: only today-or-future events
    query = query.or(`date.gte.${today},end_date.gte.${today}`)
  }

  const { data, error } = await query.order('date', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, location, date, start_time, end_time } = await req.json()

  const { data, error } = await supabase
    .from('events')
    .insert({
      title, location, date, start_time, end_time,
      category: 'personal', status: 'confirmed',
      rsvp_dimitri: 'going', added_by: 'dimitri',
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
