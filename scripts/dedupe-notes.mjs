#!/usr/bin/env node
/**
 * Remove duplicate note / youtube rows that came from the old BeReal model
 * (a single "note" stored a blank GIF in BOTH front and back, so the 0006
 * migration produced two identical rows per note).
 *
 * For each event we keep one row per distinct (kind, content) — i.e. duplicate
 * notes with the same caption are collapsed to one, duplicate youtube links too.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const { data: rows } = await sb
  .from('event_media')
  .select('id,event_id,kind,caption,youtube_url,created_at')
  .order('created_at', { ascending: false })
  .limit(2000)

// keep earliest created per event for a given (kind, normalized content)
const seen = new Set()
const toDelete = []
for (const r of rows) {
  if (r.kind !== 'note' && r.kind !== 'youtube') continue
  const content = r.kind === 'note' ? (r.caption || '').trim() : (r.youtube_url || '').trim()
  if (!content) continue
  const key = `${r.event_id}|${r.kind}|${content}`
  if (seen.has(key)) {
    toDelete.push(r.id)
  } else {
    seen.add(key)
  }
}

console.log(`Duplicates to remove: ${toDelete.length}`)
if (toDelete.length) {
  const { error } = await sb.from('event_media').delete().in('id', toDelete)
  if (error) { console.error('delete failed:', error.message); process.exit(1) }
  console.log('Removed.')
} else {
  console.log('Nothing to remove.')
}
