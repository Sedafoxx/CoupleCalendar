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

// Today in Vienna as YYYY-MM-DD (avoids UTC-midnight drift that hides today's events).
export function viennaToday(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Vienna' }).slice(0, 10)
}
