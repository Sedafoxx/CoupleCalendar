import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type EventType = 'single' | 'window' | 'recurring' | 'bucket_list' | 'sleepover'

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
