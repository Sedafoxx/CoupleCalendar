import { getCalendarClient } from '@/lib/google-auth'
import { supabase } from '@/lib/supabase'
import { NextRequest } from 'next/server'

function utcToVienna(iso: string): { date: string; time: string } {
  const str = new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Vienna' }) // "YYYY-MM-DD HH:MM:SS"
  const [date, time] = str.split(' ')
  return { date, time: time.slice(0, 5) }
}

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
  // Convert UTC ISO times to Vienna local for storage
  const { date, time: startT } = utcToVienna(startTime)
  const { time: endT } = utcToVienna(endTime)

  await supabase.from('events').insert({
    title,
    location: location ?? '',
    date,
    start_time: startT,
    end_time: endT,
  })

  return Response.json({ id: event.data.id }, { status: 201 })
}
