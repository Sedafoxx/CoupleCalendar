import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type Event = {
  id: string
  title: string
  location: string
  date: string
  start_time: string
  end_time: string
  created_at: string
}
