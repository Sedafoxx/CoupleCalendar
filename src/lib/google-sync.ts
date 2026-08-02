import { getCalendarClient } from './google-auth'
import { viennaToday } from './event-utils'
import type { Event } from './supabase'

// Pushes a couple-calendar event that both partners confirmed ("going") into
// Dimitri's primary Google Calendar. Best-effort and idempotent — it mirrors
// the same convention as the chat reconcile (match by title + day, never
// duplicate). Any failure is logged and swallowed so a Google hiccup never
// breaks the confirmation request itself.

function getViennaOffset(dateStr: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Vienna',
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date(`${dateStr}T12:00:00Z`))
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+02:00'
  const raw = tzName.replace('GMT', '')
  const match = raw.match(/^([+-])(\d+)(?::(\d{2}))?$/)
  if (!match) return '+02:00'
  return `${match[1]}${match[2].padStart(2, '0')}:${match[3] ?? '00'}`
}

// Pure UTC date math — no timezone drift. (The old `toISOString()` trick
// returned the *same* day for Vienna because local midnight is the previous
// day in UTC, which broke both the idempotency window and all-day end dates.)
function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().split('T')[0]
}

// Normalize "19:00" / "19:00:00" → "19:00".
function normTime(t: string | null | undefined): string {
  const [h = '00', m = '00'] = (t ?? '').split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

// If only a start time is set, assume a 2-hour date by default.
function defaultEndTime(start: string): string {
  const [h = 0, m = 0] = start.split(':').map(Number)
  const endH = (isNaN(h) ? 0 : h) + 2
  const endM = isNaN(m) ? 0 : m
  return `${String(endH % 24).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}

// Resolve a valid same-day end time. Falls back to start+2h when the end is
// missing, zero-length, or earlier than the start (e.g. "00:00") — otherwise
// Google rejects the insert with "end time must be after start time".
function resolveEndTime(start: string, end: string | null | undefined): string {
  const s = normTime(start)
  const e = end ? normTime(end) : ''
  if (!e || e <= s) return defaultEndTime(s)
  return e
}

// Each night of a sleepover = one 22:00 → 08:00 (next day) entry. Inclusive range.
function nightsBetween(start: string, end: string | null): string[] {
  const last = end && end !== start ? end : start
  const out: string[] = []
  let cur = start
  while (cur <= last) {
    out.push(cur)
    cur = addOneDay(cur)
  }
  return out
}

async function googleHasMatch(
  calendar: Awaited<ReturnType<typeof getCalendarClient>>,
  summary: string,
  date: string,
): Promise<boolean> {
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: `${date}T00:00:00Z`,
    timeMax: `${addOneDay(date)}T00:00:00Z`,
    singleEvents: true,
    maxResults: 250,
  })
  const want = summary.trim().toLowerCase()
  return (res.data.items ?? []).some(it => (it.summary ?? '').trim().toLowerCase() === want)
}

export async function syncConfirmedEventToGoogle(ev: Event): Promise<boolean> {
  if (!ev.title || !ev.date) return false

  // Only push current/future dates — past entries would just clutter the calendar.
  const today = viennaToday()
  const isCurrentOrFuture = ev.date >= today || (ev.end_date != null && ev.end_date >= today)
  if (!isCurrentOrFuture) return false

  let calendar
  try {
    calendar = await getCalendarClient()
  } catch (err) {
    console.error(`[google-sync] no calendar client for "${ev.title}":`, err)
    return false
  }

  try {
    // Sleepovers keep the existing "Theresa" overnight convention so we never
    // double-book the same nights the Theresa chat already reconciled.
    if (ev.type === 'sleepover') {
      let inserted = false
      for (const night of nightsBetween(ev.date, ev.end_date || null)) {
        if (await googleHasMatch(calendar, 'Theresa', night)) continue
        const morning = addOneDay(night)
        await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: 'Theresa',
            start: { dateTime: `${night}T22:00:00${getViennaOffset(night)}` },
            end: { dateTime: `${morning}T08:00:00${getViennaOffset(morning)}` },
          },
        })
        inserted = true
      }
      if (inserted) console.log(`[google-sync] synced sleepover "${ev.title}" to Google`)
      return inserted
    }

    if (await googleHasMatch(calendar, ev.title, ev.date)) return false

    // Chat-created events that have no real time come through as 00:00/00:00.
    // Those (and events with no start time at all) must be all-day, otherwise
    // we'd write a bogus midnight-to-02:00 timed event (or a rejected one).
    const startTime = ev.start_time ? normTime(ev.start_time) : ''
    const endTime = ev.end_time ? normTime(ev.end_time) : ''
    const isTimed = startTime !== '' && !(startTime === '00:00' && (endTime === '' || endTime === '00:00'))

    if (isTimed) {
      const end = resolveEndTime(startTime, ev.end_time)
      await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: ev.title,
          location: ev.location || '',
          start: { dateTime: `${ev.date}T${startTime}:00${getViennaOffset(ev.date)}` },
          end: { dateTime: `${ev.date}T${end}:00${getViennaOffset(ev.date)}` },
          ...(ev.recurrence_rule ? { recurrence: [ev.recurrence_rule] } : {}),
        },
      })
    } else {
      // All-day; multi-day when it's a window with an end_date.
      const lastDay = ev.end_date && ev.end_date > ev.date ? ev.end_date : ev.date
      await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: ev.title,
          location: ev.location || '',
          start: { date: ev.date },
          end: { date: addOneDay(lastDay) },
          ...(ev.recurrence_rule ? { recurrence: [ev.recurrence_rule] } : {}),
        },
      })
    }

    console.log(`[google-sync] synced "${ev.title}" (${ev.date}) to Google`)
    return true
  } catch (err) {
    console.error(`[google-sync] failed for "${ev.title}" (${ev.date}):`, err)
    return false
  }
}
