import { getCalendarClient } from '@/lib/google-auth'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .order('date', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!events?.length) return Response.json([])

  let calendar
  try {
    calendar = await getCalendarClient()
  } catch {
    return Response.json({ error: 'Calendar not connected. Dimitri must log in first.' }, { status: 503 })
  }

  const now = new Date()
  const results = []

  for (const event of events) {
    const eventStart = new Date(`${event.date}T${event.start_time}`)
    const eventEnd = new Date(`${event.date}T${event.end_time}`)

    if (eventEnd < now) continue

    try {
      const res = await calendar.freebusy.query({
        requestBody: {
          timeMin: eventStart.toISOString(),
          timeMax: eventEnd.toISOString(),
          items: [{ id: 'primary' }],
        },
      })

      const busy = res.data.calendars?.primary?.busy ?? []
      const freeSlots = computeFreeSlots(eventStart, eventEnd, busy as BusyBlock[])

      if (freeSlots.length > 0) {
        results.push({ event, freeSlots })
      }
    } catch {
      // skip events where calendar query fails
    }
  }

  return Response.json(results)
}

type BusyBlock = { start?: string | null; end?: string | null }

function computeFreeSlots(start: Date, end: Date, busy: BusyBlock[]) {
  const slots: { start: string; end: string }[] = []
  let cursor = start

  const sorted = busy
    .filter((b): b is { start: string; end: string } => !!b.start && !!b.end)
    .map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  for (const block of sorted) {
    if (block.start > cursor) {
      slots.push({ start: cursor.toISOString(), end: block.start.toISOString() })
    }
    if (block.end > cursor) cursor = block.end
  }

  if (cursor < end) {
    slots.push({ start: cursor.toISOString(), end: end.toISOString() })
  }

  return slots
}
