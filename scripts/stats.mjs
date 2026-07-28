import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf-8')
const url = env.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL')).split('=')[1].trim()
const key = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim()
const sup = createClient(url, key)

const { data: events } = await sup.from('events').select('date,title,id').order('date', { ascending: false })
const { data: mems } = await sup.from('memories').select('event_id,caption,photo_back')

// Group by month
const months = {}
for (const e of events || []) {
  const m = e.date.substring(0, 7)
  if (!months[m]) months[m] = []
  months[m].push(e)
}

console.log('=== Events per month ===')
for (const [m, list] of Object.entries(months).sort()) {
  const withMem = list.filter(e => mems?.some(mm => mm.event_id === e.id)).length
  console.log(`${m}: ${list.length} events (${withMem} with memories)`)
}

console.log(`\nTotal events: ${events?.length || 0}`)
console.log(`Total memories: ${mems?.length || 0}`)

// Check what's on the last pages (newest events)
console.log('\n=== Last 5 events ===')
for (const e of (events || []).slice(0, 5)) {
  const hasMem = mems?.some(m => m.event_id === e.id)
  console.log(` ${e.date} — ${e.title} ${hasMem ? '📸' : '♡'}`)
}
