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

// Runtime helpers live in lib/event-utils.ts so client components can import
// them without pulling this service-role client into the browser bundle.

export type BucketListItem = {
  id: string
  title: string
  description: string | null
  tags: string[] | null
  duration_days: number | null
  added_by: string
  created_at: string
  resolved?: boolean
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

export type Memory = {
  id: string
  event_id: string
  captured_by: 'dimitri' | 'theresa'
  photo_front: string   // Supabase Storage URL
  photo_back: string    // Supabase Storage URL
  caption: string | null
  created_at: string
  // Joined from events table when fetching with event details
  event_title?: string
  event_date?: string
}

export type MediaKind = 'photo' | 'video' | 'youtube' | 'note'

// One media item attached to an event (photo / video / youtube link / text note).
// An event may have many items — replaces the old forced front/back pair.
export type EventMedia = {
  id: string
  event_id: string
  kind: MediaKind
  url: string | null          // storage URL for photo/video
  youtube_url: string | null  // watch URL for kind === 'youtube'
  caption: string | null
  added_by: 'dimitri' | 'theresa'
  created_at: string
  // Joined from events table when fetched with event details
  event_title?: string
  event_date?: string
}
