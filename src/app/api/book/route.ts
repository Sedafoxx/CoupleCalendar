import { getCalendarClient } from '@/lib/google-auth'
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

  return Response.json({ id: event.data.id }, { status: 201 })
}
