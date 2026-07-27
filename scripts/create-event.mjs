import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf-8')
const supabaseUrl = env.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL')).split('=')[1].trim()
const serviceKey = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim()

const supabase = createClient(supabaseUrl, serviceKey)

// Create the Rathausplatz event
const { data, error } = await supabase.from('events').insert({
  title: 'Rathausplatz Film Festival — Amy Winehouse & Raye',
  location: 'Rathausplatz, Wien',
  date: '2026-07-23',
  start_time: '19:00',
  end_time: '23:00',
  type: 'single',
  category: 'personal',
  status: 'confirmed',
  rsvp_dimitri: 'going',
  added_by: 'dimitri',
  joinable: true,
}).select()

if (error) {
  console.error('Error:', error.message)
} else {
  console.log('Created event:', data[0].id, data[0].title)
}

// Also create a "Have Done" type event for "Rathausplatz was great!"
const { data: d2, error: e2 } = await supabase.from('events').insert({
  title: '🍿 Filmabend am Rathausplatz',
  location: 'Rathausplatz, Wien',
  date: '2026-07-23',
  start_time: '20:00',
  end_time: '22:30',
  type: 'single',
  category: 'personal',
  status: 'confirmed',
  rsvp_dimitri: 'going',
  rsvp_theresa: 'going',
  added_by: 'dimitri',
  joinable: true,
}).select()

if (e2) {
  console.error('Error 2:', e2.message)
} else {
  console.log('Created event 2:', d2[0].id, d2[0].title)
}
