import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf-8')
const url = env.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL')).split('=')[1].trim()
const key = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim()
const sup = createClient(url, key)

// Try a raw SQL query via the Supabase REST API
// The endpoint supports POST to /rest/v1/ with query parameters
const ref = url.replace('https://', '').split('.')[0]

// Use fetch to call the management API with service key
const response = await fetch(`${url}/rest/v1/`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'X-HTTP-Method-Override': 'PATCH',
  },
  body: JSON.stringify({})
})

// Try alternative: use the SQL query through the client
const { error } = await sup.from('bucket_list').update({ 
  title: '---TEST---' 
}).eq('title', '---TEST---')

// The error will tell us if the column exists

console.log('Supabase URL:', url)
console.log('Ref:', ref)
console.log('Response status:', response.status)

// Let's try to add the column by using the database API directly
// Fetch to add column via postgrest
const alterRes = await fetch(`${url}/rest/v1/rpc/`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': key,
    'Authorization': `Bearer ${key}`,
  },
})

console.log('\nTo add the resolved column, please run this in Supabase SQL Editor:')
console.log('ALTER TABLE bucket_list ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT false;')
console.log('\nOr click here: https://supabase.com/dashboard/project/flsgxwhozgdeekgplkep/sql/new')
