// Verify discovery ingest: count city events by source + show a few RA samples.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const today = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Vienna' }).slice(0, 10)

const { data, error } = await supabase
  .from('events')
  .select('source, title, date, start_time, location, image_url, url, status')
  .eq('category', 'city')
  .gte('date', today)
  .order('date', { ascending: true })

if (error) { console.error('Query error:', error.message); process.exit(1) }

const bySource = {}
for (const e of data ?? []) bySource[e.source] = (bySource[e.source] || 0) + 1
console.log('City events (today+):', data?.length ?? 0, JSON.stringify(bySource))

const ra = (data ?? []).filter(e => e.source === 'ra').slice(0, 8)
for (const e of ra) {
  console.log(`  ra | ${e.date} ${e.start_time ?? ''} | ${e.title} @ ${e.location} | img=${e.image_url ? 'yes' : 'no'} | ${e.url}`)
}
