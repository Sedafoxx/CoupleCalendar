// One-time backfill + verification: push every currently-confirmed (both RSVP
// "going") current/future event into Dimitri's primary Google Calendar.
// Mirrors src/lib/google-sync.ts so behaviour matches the production path.
// Idempotent — skips events already present in Google (same title + day).
//
// Usage:
//   node scripts/sync-confirmed-to-google.mjs --dry-run   # report only, no writes
//   node scripts/sync-confirmed-to-google.mjs             # actually sync

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

// ── Load .env.local ─────────────────────────────────────────────
const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const dryRun = process.argv.includes('--dry-run')
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

// ── Helpers (mirror of src/lib/google-sync.ts) ─────────────────
const TZ = 'Europe/Vienna'
function viennaToday() {
  return new Date().toLocaleString('sv-SE', { timeZone: TZ }).slice(0, 10)
}
function getViennaOffset(dateStr) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, timeZoneName: 'shortOffset',
  }).formatToParts(new Date(`${dateStr}T12:00:00Z`))
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+02:00'
  const raw = tzName.replace('GMT', '')
  const match = raw.match(/^([+-])(\d+)(?::(\d{2}))?$/)
  if (!match) return '+02:00'
  return `${match[1]}${match[2].padStart(2, '0')}:${match[3] ?? '00'}`
}
// Pure UTC date math — no timezone drift (the old toISOString() trick returned
// the same day for Vienna and broke both the idempotency window and end dates).
function addOneDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().split('T')[0]
}
function normTime(t) {
  const [h = '00', m = '00'] = (t ?? '').split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}
function defaultEndTime(start) {
  const [h = 0, m = 0] = start.split(':').map(Number)
  const endH = (isNaN(h) ? 0 : h) + 2
  const endM = isNaN(m) ? 0 : m
  return `${String(endH % 24).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
}
function resolveEndTime(start, end) {
  const s = normTime(start)
  const e = end ? normTime(end) : ''
  if (!e || e <= s) return defaultEndTime(s)
  return e
}

// ── Fetch confirmed events ──────────────────────────────────────
const today = viennaToday()
const { data: events, error } = await supabase
  .from('events')
  .select('*')
  .eq('rsvp_dimitri', 'going')
  .eq('rsvp_theresa', 'going')
  .eq('archived', false)
  .or(`date.gte.${today},end_date.gte.${today}`)

if (error) {
  console.error('Query error:', error.message)
  process.exit(1)
}
console.log(`Found ${events.length} confirmed event(s) (today or later).`)
if (!events.length) process.exit(0)

// ── Google client ───────────────────────────────────────────────
const { data: tokens } = await supabase.from('google_tokens').select('*').single()
if (!tokens?.refresh_token) {
  console.error('❌ No Google tokens stored — Dimitri must log in via Google first.')
  process.exit(1)
}
const auth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
auth.setCredentials({
  access_token: tokens.access_token,
  refresh_token: tokens.refresh_token,
  expiry_date: tokens.expires_at ? tokens.expires_at * 1000 : undefined,
})
auth.on('tokens', async (t) => {
  await supabase.from('google_tokens').update({
    access_token: t.access_token,
    expires_at: t.expiry_date ? Math.floor(t.expiry_date / 1000) : undefined,
  }).eq('id', 1)
})
const calendar = google.calendar({ version: 'v3', auth })

async function googleHasMatch(summary, date) {
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: `${date}T00:00:00Z`,
    timeMax: `${addOneDay(date)}T00:00:00Z`,
    singleEvents: true,
    maxResults: 250,
  })
  const want = summary.trim().toLowerCase()
  return (res.data.items ?? []).some(it => (it.summary ?? '').trim().toLowerCase() === want)
}

// ── Sync loop ───────────────────────────────────────────────────
let synced = 0, skipped = 0, failed = 0
for (const ev of events) {
  const already = await googleHasMatch(ev.title, ev.date)
  if (already) {
    skipped++
    console.log(`⏭  already in Google  : ${ev.title} @ ${ev.date}`)
    continue
  }
  const startTime = ev.start_time ? normTime(ev.start_time) : ''
  const endTime = ev.end_time ? normTime(ev.end_time) : ''
  const isTimed = startTime !== '' && !(startTime === '00:00' && (endTime === '' || endTime === '00:00'))

  if (dryRun) {
    console.log(`🔍 WOULD SYNC         : ${ev.title} @ ${ev.date}${isTimed ? ` (${startTime}–${resolveEndTime(startTime, ev.end_time)})` : ` (all-day${ev.end_date && ev.end_date > ev.date ? ` → ${ev.end_date}` : ''})`}`)
    continue
  }
  try {

    if (isTimed) {
      const end = resolveEndTime(startTime, ev.end_time)
      await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: ev.title,
          location: ev.location || '',
          start: { dateTime: `${ev.date}T${startTime}:00${getViennaOffset(ev.date)}` },
          end: { dateTime: `${ev.date}T${end}:00${getViennaOffset(ev.date)}` },
          ...(ev.recurrence_rule ? { recurrence: [ev.recurrence_rule] } : {}),
        },
      })
    } else {
      const lastDay = ev.end_date && ev.end_date > ev.date ? ev.end_date : ev.date
      await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: ev.title,
          location: ev.location || '',
          start: { date: ev.date },
          end: { date: addOneDay(lastDay) },
          ...(ev.recurrence_rule ? { recurrence: [ev.recurrence_rule] } : {}),
        },
      })
    }
    synced++
    console.log(`✅ SYNCED             : ${ev.title} @ ${ev.date}`)
  } catch (e) {
    failed++
    console.error(`❌ FAILED             : ${ev.title} @ ${ev.date} — ${e.message}`)
  }
}

console.log(`\nDone. synced=${synced} skipped=${skipped} failed=${failed}${dryRun ? ' (dry run, no writes)' : ''}`)
