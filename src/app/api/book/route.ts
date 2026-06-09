import { getCalendarClient } from '@/lib/google-auth'
import { supabase } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const { title, location, startTime, endTime } = await req.json()

  if (!title || !startTime || !endTime) {
    return Response.json({ error: 'title, startTime, endTime required' }, { status: 400 })
  }

  let calendar
  try {
    calendar = await getCalendarClient()
  } catch {
    return Response.json({ error: 'Calendar not connected.' }, { status: 503 })
  }

  const event = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: title,
      location: location ?? '',
      start: { dateTime: startTime },
      end: { dateTime: endTime },
    },
  })

  // Mirror to Supabase so it shows in the dashboard
  const start = new Date(startTime)
  const end = new Date(endTime)
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
  const startT = `${pad(start.getHours())}:${pad(start.getMinutes())}`
  const endT = `${pad(end.getHours())}:${pad(end.getMinutes())}`

  await supabase.from('events').insert({
    title,
    location: location ?? '',
    date,
    start_time: startT,
    end_time: endT,
  })

  return Response.json({ id: event.data.id }, { status: 201 })
}
