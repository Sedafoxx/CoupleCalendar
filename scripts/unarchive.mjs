import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf-8')
const url = env.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL')).split('=')[1].trim()
const key = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim()
const sup = createClient(url, key)

// Unarchive ALL personal events
const { data, error } = await sup
  .from('events')
  .update({ archived: false })
  .eq('archived', true)
  .neq('category', 'city')
  .select('id,title,date')

if (error) {
  console.error('Error:', error.message)
} else {
  console.log(`Unarchived ${data?.length || 0} events:`)
  for (const e of data || []) console.log(` ${e.date} — ${e.title?.substring(0, 50)}`)
}
