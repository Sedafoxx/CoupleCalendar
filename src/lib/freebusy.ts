import { getCalendarClient } from './google-auth'

const TZ = 'Europe/Vienna'
const DAY_START_H = 9
const DAY_END_H = 22
const MIN_SLOT_MIN = 60
const DAYS_AHEAD = 14
const WORK_CAL = 'buryak2001@gmail.com'

function viennaDate(dateStr: string, timeH: number): Date {
  const probe = new Date(`${dateStr}T12:00:00Z`)
  const viennaHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).format(probe)
  )
  const offset = viennaHour - 12
  const tz = `${offset >= 0 ? '+' : '-'}${String(Math.abs(offset)).padStart(2, '0')}:00`
  return new Date(`${dateStr}T${String(timeH).padStart(2, '0')}:00:00${tz}`)
}

function isoDateVienna(date: Date): string {
  return date.toLocaleDateString('sv-SE', { timeZone: TZ })
}

type BusyBlock = { start?: string | null; end?: string | null }

function computeFreeSlots(dayStart: Date, dayEnd: Date, busy: BusyBlock[]) {
  const slots: { start: string; end: string }[] = []
  let cursor = dayStart

  const sorted = busy
    .filter((b): b is { start: string; end: string } => !!b.start && !!b.end)
    .map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  for (const block of sorted) {
    if (block.start > cursor) {
      const gap = (block.start.getTime() - cursor.getTime()) / 60000
      if (gap >= MIN_SLOT_MIN) {
        slots.push({ start: cursor.toISOString(), end: block.start.toISOString() })
      }
    }
    if (block.end > cursor) cursor = block.end
  }

  if (cursor < dayEnd) {
    const gap = (dayEnd.getTime() - cursor.getTime()) / 60000
    if (gap >= MIN_SLOT_MIN) {
      slots.push({ start: cursor.toISOString(), end: dayEnd.toISOString() })
    }
  }

  return slots
}

export type FreeSlot = { start: string; end: string }
export type DateSlots = { date: string; freeSlots: FreeSlot[] }

export async function getFreeBusySlots(): Promise<DateSlots[]> {
  const calendar = await getCalendarClient()
  const now = new Date()
  const todayStr = isoDateVienna(now)

  const dates: string[] = []
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    dates.push(isoDateVienna(d))
  }

  const timeMin = viennaDate(todayStr, DAY_START_H).toISOString()
  const timeMax = viennaDate(dates[dates.length - 1], DAY_END_H).toISOString()

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: TZ,
      items: [{ id: 'primary' }, { id: WORK_CAL }],
    },
  })

  const workCalData = res.data.calendars?.[WORK_CAL]
  const workCalErrors = workCalData?.errors
  if (workCalErrors?.length) {
    throw new Error(`Work calendar not readable: ${workCalErrors.map((e: { reason?: string | null }) => e.reason ?? 'unknown').join(', ')}`)
  }

  const busy: BusyBlock[] = [
    ...(res.data.calendars?.['primary']?.busy ?? []),
    ...(workCalData?.busy ?? []),
  ]

  const results: DateSlots[] = []

  for (const dateStr of dates) {
    const dayStart = viennaDate(dateStr, DAY_START_H)
    const dayEnd = viennaDate(dateStr, DAY_END_H)

    if (dayEnd < now) continue

    const effectiveStart = dayStart < now ? now : dayStart

    const dayBusy = busy.filter(b => {
      if (!b.start || !b.end) return false
      const bs = new Date(b.start)
      const be = new Date(b.end)
      return be > effectiveStart && bs < dayEnd
    })

    const freeSlots = computeFreeSlots(effectiveStart, dayEnd, dayBusy)
    if (freeSlots.length > 0) {
      results.push({ date: dateStr, freeSlots })
    }
  }

  return results
}
