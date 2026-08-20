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
