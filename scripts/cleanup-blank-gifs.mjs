#!/usr/bin/env node
/**
 * One-time cleanup for the event-media gallery migration.
 *
 * In the old BeReal model, text notes (and a few YouTube links) were stored as
 * "memories" whose photos were a 1x1 transparent GIF + a real caption. The 0006
 * migration copied those as kind='photo' rows whose url is an empty GIF, which
 * renders as a blank/black item.
 *
 * This script re-classifies them:
 *   - caption is a YouTube URL            -> kind='youtube', youtube_url set, url cleared
 *   - caption is real text                -> kind='note', url cleared (caption kept)
 *   - no caption / truly empty            -> row deleted
 *
 * Run: node scripts/cleanup-blank-gifs.mjs
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

const YT_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/

async function main() {
  const { data: rows, error } = await sb.from('event_media').select('*').order('created_at', { ascending: false }).limit(1000)
  if (error) throw new Error(error.message)

  let notes = 0, youtubes = 0, deleted = 0
  for (const row of rows) {
    if (row.kind !== 'photo' || !row.url) continue
    // Only touch rows whose storage object is a tiny transparent GIF.
    let res
    try { res = await fetch(row.url) } catch { continue }
    if (!res.ok) continue
    const buf = Buffer.from(await res.arrayBuffer())
    const isTinyGif = buf.length <= 120 && (row.url.endsWith('.gif') || (res.headers.get('content-type') || '').includes('gif'))
    if (!isTinyGif) continue

    const caption = (row.caption || '').trim()
    const yt = caption.match(YT_RE)

    if (!caption) {
      // Truly empty placeholder -> delete
      const { error: delErr } = await sb.from('event_media').delete().eq('id', row.id)
      if (delErr) console.error('delete fail', row.id, delErr.message); else deleted++
    } else if (yt) {
      const { error: upErr } = await sb.from('event_media')
        .update({ kind: 'youtube', youtube_url: `https://www.youtube.com/watch?v=${yt[1]}`, url: null })
        .eq('id', row.id)
      if (upErr) console.error('yt fail', row.id, upErr.message); else youtubes++
    } else {
      const { error: upErr } = await sb.from('event_media')
        .update({ kind: 'note', url: null })
        .eq('id', row.id)
      if (upErr) console.error('note fail', row.id, upErr.message); else notes++
    }
  }
  console.log(`Done. reclassified -> notes: ${notes}, youtube: ${youtubes}, deleted empty: ${deleted}`)
}

main().catch(e => { console.error(e); process.exit(1) })
