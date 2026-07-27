import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf-8')
const url = env.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL')).split('=')[1].trim()
const key = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim()
const supabase = createClient(url, key)

// Show July 15 events
const { data: events } = await supabase.from('events').select('id,title').eq('date', '2026-07-15')
console.log('July 15 events found:', events?.length || 0)
for (const e of events || []) console.log(' -', e.title)

// Delete them
const { error } = await supabase.from('events').delete().eq('date', '2026-07-15')
console.log('Deleted:', error ? 'Error: ' + error.message : '✅ All July 15 events removed')
