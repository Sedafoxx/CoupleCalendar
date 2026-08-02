// Inspect provenance: distinct added_by × category counts for upcoming events.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data, error } = await supabase.from('events').select('added_by, category').gte('date', '2026-01-01')
if (error) { console.error(error.message); process.exit(1) }

const counts = {}
for (const e of data ?? []) {
  const k = `${e.added_by ?? 'null'} / ${e.category ?? 'null'}`
  counts[k] = (counts[k] || 0) + 1
}
console.log(JSON.stringify(counts, null, 2))
