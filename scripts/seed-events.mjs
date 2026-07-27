import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf-8')
const supabaseUrl = env.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL')).split('=')[1].trim()
const serviceKey = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim()
const supabase = createClient(supabaseUrl, serviceKey)

const events = [
  { date: '2026-05-22', title: 'House Party — first time meeting Theresa ♡', start_time: '20:00', end_time: '02:00' },
  { date: '2026-05-23', title: 'First Date ♡ — Westbahnhof, Ikea Flohmarkt, Joe & Joe im Ikea Tower', start_time: '14:00', end_time: '18:00' },
  { date: '2026-05-23', title: 'First Date Part 2 — Rave nearby + frndswave at G5 bar', start_time: '22:00', end_time: '02:00' },
  { date: '2026-05-24', title: 'Gürtel Connection', start_time: '19:00', end_time: '23:00' },
  { date: '2026-05-25', title: 'Picknick im Stadtpark + Zwetschgenröster Eis ♡', start_time: '14:00', end_time: '17:00' },
  { date: '2026-05-31', title: 'Beim Umzug von Klara geholfen + Brot und Spiele', start_time: '11:00', end_time: '18:00' },
  { date: '2026-06-02', title: 'Drag Event am Spittelau Würstlstand', start_time: '19:00', end_time: '23:00' },
  { date: '2026-06-03', title: 'Kathis Birthday Party', start_time: '18:00', end_time: '23:59' },
  { date: '2026-06-05', title: 'Bei mir zuhause — ihr meine Musik gezeigt ♡', start_time: '17:00', end_time: '22:00' },
  { date: '2026-06-06', title: 'Jakob, Niko & Sasas Birthday', start_time: '16:00', end_time: '23:59' },
  { date: '2026-06-07', title: 'Lenny & Lara besucht — Spieleabend', start_time: '14:00', end_time: '20:00' },
  { date: '2026-06-16', title: 'Pharma Pubquiz', start_time: '19:00', end_time: '23:00' },
  { date: '2026-06-18', title: 'Drink im MuseumsQuartier', start_time: '19:00', end_time: '22:00' },
  { date: '2026-06-19', title: 'Baden in der Alten Donau — ihren Bruder getroffen — erste "Ich liebe dich" ♡♡♡', start_time: '12:00', end_time: '19:00' },
  { date: '2026-06-23', title: 'Alte Donau — wieder baden', start_time: '13:00', end_time: '18:00' },
  { date: '2026-06-25', title: 'Drink mit Marlies & Astrid', start_time: '19:00', end_time: '22:00' },
  { date: '2026-06-27', title: 'Pharma Summer Party', start_time: '18:00', end_time: '23:59' },
  { date: '2026-07-01', title: 'Eis essen — zum ersten Mal vor ihr geweint — ihr mein Song & Musikvideo gezeigt ♡', start_time: '16:00', end_time: '20:00' },
  { date: '2026-07-11', title: 'Drink am Rochus', start_time: '19:00', end_time: '22:00' },
  { date: '2026-07-19', title: 'Tiefes Gespräch an der Strudlhof Stiege + Badeschiff am Donaukanal', start_time: '18:00', end_time: '23:00' },
  { date: '2026-07-21', title: 'Kino am Dach — Urban Loritz Platz', start_time: '20:00', end_time: '23:00' },
]

let created = 0
let skipped = 0

for (const ev of events) {
  // Check if event already exists on this date with similar title
  const { data: existing } = await supabase
    .from('events')
    .select('id, title')
    .eq('date', ev.date)
    .ilike('title', `%${ev.title.substring(0, 20)}%`)

  if (existing && existing.length > 0) {
    console.log(`⏭️  Skipped (exists): ${ev.date} — ${ev.title}`)
    skipped++
    continue
  }

  const { data, error } = await supabase.from('events').insert({
    title: ev.title,
    location: '',
    date: ev.date,
    start_time: ev.start_time,
    end_time: ev.end_time,
    type: 'single',
    category: 'personal',
    status: 'confirmed',
    rsvp_dimitri: 'going',
    rsvp_theresa: 'going',
    added_by: 'dimitri',
    joinable: true,
  }).select()

  if (error) {
    console.log(`❌ Error: ${ev.date} — ${ev.title}: ${error.message}`)
  } else {
    console.log(`✅ Created: ${ev.date} — ${ev.title}`)
    created++
  }
}

console.log(`\nDone! ${created} created, ${skipped} skipped`)
