import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf-8')
const url = env.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL')).split('=')[1].trim()
const key = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim()
const sup = createClient(url, key)

// Add resolved column
const { error } = await sup.rpc('exec_sql', {
  query: 'alter table bucket_list add column if not exists resolved boolean not null default false'
}).maybeSingle()

if (error) {
  // Fallback: direct SQL via REST
  const res = await fetch(`${url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({})
  })
}

// Just try inserting via the API by doing a simple update
const { error: e2 } = await sup.from('bucket_list').update({ resolved: false }).eq('resolved', null)
console.log(e2 ? 'Error: ' + e2.message : '✅ resolved column ready')

// Show current items
const { data } = await sup.from('bucket_list').select('id,title,resolved').order('created_at', { ascending: false })
for (const item of data || []) console.log(` ${item.resolved ? '✅' : '✨'} ${item.title}`)
