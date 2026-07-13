import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type EventType = 'single' | 'window' | 'recurring' | 'bucket_list' | 'sleepover'

export type EventCategory = 'personal' | 'city'
export type EventStatus = 'confirmed' | 'proposed'
export type Rsvp = 'going' | 'interested' | 'maybe' | null

export type Event = {
  id: string
  title: string
  location: string
  date: string
  start_time: string
  end_time: string
  joinable: boolean
  created_at: string
  type: EventType
  end_date: string | null
  recurrence_rule: string | null
  duration_days: number | null
  added_by: string
  category: EventCategory
  status: EventStatus
  rsvp_dimitri: Rsvp
  rsvp_theresa: Rsvp
  source: string | null
  source_id: string | null
  image_url: string | null
  url: string | null
  tags: string[] | null
  archived: boolean
}

// Both partners said "going" → it's a real, confirmed date.
export function bothGoing(e: Pick<Event, 'rsvp_dimitri' | 'rsvp_theresa'>): boolean {
  return e.rsvp_dimitri === 'going' && e.rsvp_theresa === 'going'
}

// Today in Vienna as YYYY-MM-DD (avoids UTC-midnight drift that hides today's events).
export function viennaToday(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Vienna' }).slice(0, 10)
}

export type BucketListItem = {
  id: string
  title: string
  description: string | null
  tags: string[] | null
  duration_days: number | null
  added_by: string
  created_at: string
}

export type NotificationKind = 'event' | 'sleepover' | 'bucket_list'

export type Notification = {
  id: string
  message: string
  kind: NotificationKind
  event_id: string | null
  read: boolean
  created_at: string
}
