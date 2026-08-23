// Pure event helpers — safe to import from client components.
// Deliberately free of any Supabase client import: lib/supabase.ts constructs a
// service-role client at module scope, so importing a *value* from it in a
// client component drags that into the browser bundle, where the service-role
// key is undefined and createClient() throws at hydration.

import type { Event } from '@/lib/supabase'

// Both partners said "going" → it's a real, confirmed date.
export function bothGoing(e: Pick<Event, 'rsvp_dimitri' | 'rsvp_theresa'>): boolean {
  return e.rsvp_dimitri === 'going' && e.rsvp_theresa === 'going'
}

// At least one partner said "going" → someone committed to it.
// Past events where NOBODY confirmed are treated as never-happened: they don't
// become memories and don't show up as past events.
export function anyoneGoing(e: Pick<Event, 'rsvp_dimitri' | 'rsvp_theresa'>): boolean {
  return e.rsvp_dimitri === 'going' || e.rsvp_theresa === 'going'
}

// ── Provenance: who added an event ─────────────────────────────
// dimi/theresa = manually added by the couple (real plans),
// agent       = scraped/discovered suggestions (category 'city'),
// manual      = anything else we can't classify.
export type Provenance = 'dimi' | 'theresa' | 'agent' | 'manual'

export function provenanceOf(e: { added_by?: string | null; category?: string | null }): Provenance {
  if (e.category === 'city' || e.added_by === 'discovery') return 'agent'
  if (e.added_by === 'theresa') return 'theresa'
  if (e.added_by === 'dimitri') return 'dimi'
  return 'manual'
}

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  dimi: 'Dimi',
  theresa: 'Theresa',
  agent: 'Agent',
  manual: 'Manuell',
}

// Lower = higher priority. The couple's own plans beat scraped suggestions.
export function provenanceRank(p: Provenance): number {
  return p === 'dimi' || p === 'theresa' || p === 'manual' ? 0 : 1
}

// Sort comparator: manual plans first, then by date (+ time).
export function compareByProvenanceThenDate(
  a: { added_by?: string | null; category?: string | null; date?: string; start_time?: string | null },
  b: { added_by?: string | null; category?: string | null; date?: string; start_time?: string | null },
): number {
  const rank = provenanceRank(provenanceOf(a)) - provenanceRank(provenanceOf(b))
  if (rank !== 0) return rank
  return (a.date ?? '').localeCompare(b.date ?? '') || (a.start_time ?? '').localeCompare(b.start_time ?? '')
}

// Today in Vienna as YYYY-MM-DD (avoids UTC-midnight drift that hides today's events).
export function viennaToday(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Vienna' }).slice(0, 10)
}

// ── Recurrence (weekly) ─────────────────────────────────────
// A recurring event is stored as ONE row with a start `date` plus a
// `recurrence_rule` like "weekly:sunday". These helpers expand that rule into
// the concrete dates it actually falls on, so the calendar can show every
// occurrence instead of just the first one.

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// Map a "weekly:DAY" rule (English or German, full or abbreviated) to a
// JS weekday: 0 = Sunday … 6 = Saturday. Returns null for anything else.
export function weeklyWeekday(rule: string | null | undefined): number | null {
  if (!rule) return null
  const m = rule.toLowerCase().match(/weekly[:\s]+([a-zäöü]+)/)
  if (!m) return null
  const day = m[1]
  const map: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
    sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6,
    so: 0, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6,
  }
  return map[day] ?? null
}

// Does this event fall on the given date (YYYY-MM-DD)?
// Recurring events match their weekday on/after the start (up to end_date);
// window events cover their whole date range; everything else matches exactly.
export function eventOccursOn(
  e: Pick<Event, 'type' | 'date' | 'end_date' | 'recurrence_rule'>,
  dateStr: string,
): boolean {
  if (e.recurrence_rule) {
    const wd = weeklyWeekday(e.recurrence_rule)
    if (wd === null) return false
    if (dateStr < e.date) return false
    if (e.end_date && dateStr > e.end_date) return false
    return new Date(dateStr + 'T00:00:00').getDay() === wd
  }
  if (e.type === 'window' && e.end_date) {
    return dateStr >= e.date && dateStr <= e.end_date
  }
  return dateStr === e.date
}

// All dates (inclusive) in [startDate, endDate] on which the event occurs.
export function occurrencesBetween(
  e: Pick<Event, 'type' | 'date' | 'end_date' | 'recurrence_rule'>,
  startDate: string,
  endDate: string,
): string[] {
  const out: string[] = []
  let cur = startDate
  while (cur <= endDate) {
    if (eventOccursOn(e, cur)) out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}
