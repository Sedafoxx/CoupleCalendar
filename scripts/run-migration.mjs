#!/usr/bin/env node
/**
 * Run the 0003_memories.sql migration against Supabase directly.
 * Uses the Supabase Management API via service role key.
 *
 * Usage: node scripts/run-migration.mjs
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load env
const envPath = join(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const [key, ...rest] = line.split('=')
  if (key && rest.length) env[key.trim()] = rest.join('=').trim()
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}

// Extract project ref from URL: https://<ref>.supabase.co
const projectRef = supabaseUrl.replace('https://', '').split('.')[0]

// Read the migration SQL
const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '0003_memories.sql')
const sql = readFileSync(migrationPath, 'utf-8')

console.log(`Running migration on project: ${projectRef}`)
console.log('---')

// Use Supabase Management API to run SQL
// Endpoint: POST https://api.supabase.com/v1/projects/{ref}/database/query
const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${serviceRoleKey}`,
    'Accept': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
})

if (res.ok) {
  const result = await res.json()
  console.log('✅ Migration executed successfully!')
  if (result.length > 0) {
    console.log(JSON.stringify(result, null, 2))
  }
} else {
  const error = await res.text()
  console.error('❌ Migration failed:')
  console.error(error)
  console.log('\nTo run manually, open your Supabase dashboard SQL editor and paste:')
  console.log(sql)
  process.exit(1)
}
