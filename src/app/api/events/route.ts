import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { viennaToday } from '@/lib/event-utils'
import { NextRequest } from 'next/server'

export async function GET() {
  const today = viennaToday()
  // Keep events whose date OR end_date is still today-or-future, and not archived.
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('archived', false)
    .or(`date.gte.${today},end_date.gte.${today}`)
    .order('date', { ascending: true })

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
