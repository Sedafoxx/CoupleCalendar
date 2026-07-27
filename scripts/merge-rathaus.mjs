import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf-8')
const url = env.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL')).split('=')[1].trim()
const key = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim()
const supabase = createClient(url, key)

// Find both Rathausplatz events
const { data: events } = await supabase.from('events').select('id,title').ilike('title', '%Rathaus%')
for (const e of events || []) console.log('-', e.id, e.title)

// Delete the 🍿 one (it's a duplicate)
const { error } = await supabase.from('events').delete().ilike('title', '%Filmabend%')
console.log('Deleted 🍿 Filmabend:', error ? 'Error: ' + error.message : '✅ Removed duplicate')
