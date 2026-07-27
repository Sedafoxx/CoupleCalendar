import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf-8')
const supabaseUrl = env.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL')).split('=')[1].trim()
const serviceKey = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim()
const supabase = createClient(supabaseUrl, serviceKey)

const { data: events } = await supabase.from('events').select('id,title').ilike('title', '%ihr%')

for (const ev of events || []) {
  const newTitle = ev.title.replace(/ihr/g, 'dein').replace(/ihrem/g, 'deinem').replace(/ihren/g, 'deinen')
  const { error } = await supabase.from('events').update({ title: newTitle }).eq('id', ev.id)
  console.log(error ? `❌ ${ev.title}` : `✅ ${ev.title} → ${newTitle}`)
}

console.log('\nDone!')
