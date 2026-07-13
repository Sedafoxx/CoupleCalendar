import OpenAI from 'openai'
import { supabase } from '@/lib/supabase'

// Discovery ingest: scrape Vienna event sources → tag → insert as category='city'
// suggestions the couple can browse & propose from. Ported from the Eventfinder
// project's scrape → AI-parse → upsert pattern.

const openai = new OpenAI()

export type RawEvent = {
  source: string
  source_id: string          // stable id for dedup
  title: string
  location: string
  date: string               // YYYY-MM-DD
  start_time: string         // HH:MM (24h)
  end_time: string           // HH:MM
  url: string | null
  image_url: string | null
}

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, 'Mär': 3, Apr: 4, Mai: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Okt: 10, Nov: 11, Dez: 12,
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function plusHours(hhmm: string, h: number): string {
  const [hh, mm] = hhmm.split(':').map(Number)
  return `${pad((hh + h) % 24)}:${pad(mm)}`
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#8211;/g, '-').replace(/&nbsp;/g, ' ')
    .replace(/&#8217;|&#039;/g, "'").trim()
}

// ── Source: Kino am Dach (gogogo.at) — one film per evening ─────────────────
export async function scrapeGogogo(): Promise<RawEvent[]> {
  const res = await fetch('https://www.gogogo.at/filmprogramm', {
    headers: { 'user-agent': 'Mozilla/5.0' },
  })
  const html = await res.text()

  // Each card: <a href="event-details/SLUG">TITLE</a> ... "Wtag., DD. Mon"
  const cardRe =
    /event-details\/([a-z0-9-]+)"[^>]*>\s*([^<]+?)\s*<\/a>[\s\S]{0,400}?(Mo|Di|Mi|Do|Fr|Sa|So)\.,\s*(\d{1,2})\.\s*(Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)/g
  const year = new Date().getFullYear()
  const out: RawEvent[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = cardRe.exec(html))) {
    const [, slug, rawTitle, , dayStr, monStr] = m
    if (seen.has(slug)) continue
    seen.add(slug)
    const mon = MONTHS[monStr]
    if (!mon) continue
    const date = `${year}-${pad(mon)}-${pad(Number(dayStr))}`
    out.push({
      source: 'gogogo',
      source_id: `gogogo:${slug}`,
      title: `🎬 ${decode(rawTitle).replace(/\s*\|.*$/, '')}`,
      location: 'Kino am Dach, Wien',
      date,
      start_time: '21:00',       // Kino am Dach fixed rooftop slot (verified from JSON-LD)
      end_time: '23:00',
      url: `https://www.gogogo.at/event-details/${slug}`,
      image_url: null,
    })
  }
  return out
}

// ── Source: ViennaImprov (yesticket.org feed) — shows carry real showtimes ──
export async function scrapeYesticket(): Promise<RawEvent[]> {
  const res = await fetch(
    'https://www.yesticket.org/yesticket_events.php?organizer_select=363&entries=36&setlang=de',
    { headers: { 'user-agent': 'Mozilla/5.0' } },
  )
  const html = await res.text()
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
  const L = decode(text).split('\n').map(s => s.trim()).filter(Boolean)

  const out: RawEvent[] = []
  for (let i = 0; i < L.length; i++) {
    if (MONTHS[L[i]] && /^\d{1,2}$/.test(L[i + 1] || '') && /^(19|20)\d\d$/.test(L[i + 2] || '')) {
      const mon = MONTHS[L[i]], day = Number(L[i + 1]), yr = Number(L[i + 2])
      const title = L[i + 4]                       // L[i+3] = organizer
      const tm = (L[i + 5] || '').match(/(\d{1,2}):(\d{2})/)
      const start = tm ? `${pad(+tm[1])}:${tm[2]}` : '19:30'
      const loc = (L[i + 6] || 'Wien').replace(/\.\.\.$/, '').replace(/"/g, '')
      const date = `${yr}-${pad(mon)}-${pad(day)}`
      // Only public shows are interesting as date ideas — skip workshops/trainings.
      if (/workshop|training|kurs|drop\s*in|season pass|impro für bühnenprofis/i.test(title)) continue
      out.push({
        source: 'yesticket',
        source_id: `yesticket:${date}:${title.slice(0, 40)}`,
        title: `🎭 ${title}`,
        location: loc.endsWith('Wien') ? loc : `${loc}, Wien`,
        date,
        start_time: start,
        end_time: plusHours(start, 2),
        url: 'https://viennaimprov.org/vi-event-liste/',
        image_url: null,
      })
    }
  }
  return out
}

const SOURCES: Array<() => Promise<RawEvent[]>> = [scrapeGogogo, scrapeYesticket]

// AI relevance tags for a couple in Vienna (reuses Eventfinder's tagging idea,
// re-pointed from a single-guy profile to date-idea suitability).
async function tagForDates(titles: string[]): Promise<Record<string, string[]>> {
  if (!titles.length) return {}
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You tag Vienna events by date-idea vibe for a couple. For each title return 1-3 tags ' +
            'from exactly: romantic, adventure, food, culture, outdoor, sport. ' +
            'Respond ONLY as JSON: {"tags": {"<title>": ["culture"]}}',
        },
        { role: 'user', content: JSON.stringify(titles) },
      ],
    })
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}')
    return parsed.tags ?? {}
  } catch {
    return {}
  }
}

export type IngestResult = { scraped: number; inserted: number; skipped: number }

export async function runDiscovery(): Promise<IngestResult> {
  // 1. Scrape every source (failures isolated).
  const batches = await Promise.all(
    SOURCES.map(fn => fn().catch((e) => { console.error('[discovery] source failed', e); return [] as RawEvent[] })),
  )
  const raw = batches.flat()

  // 2. Dedup against what we already imported.
  const ids = raw.map(r => r.source_id)
  const { data: existing } = await supabase
    .from('events')
    .select('source_id')
    .in('source_id', ids)
  const known = new Set((existing ?? []).map(e => e.source_id))
  const fresh = raw.filter(r => !known.has(r.source_id))

  if (!fresh.length) return { scraped: raw.length, inserted: 0, skipped: raw.length }

  // 3. AI-tag by vibe.
  const tagMap = await tagForDates(fresh.map(r => r.title))

  // 4. Insert as browsable city suggestions (nobody's committed yet).
  const rows = fresh.map(r => ({
    title: r.title,
    location: r.location,
    date: r.date,
    start_time: r.start_time,
    end_time: r.end_time,
    type: 'single' as const,
    category: 'city' as const,
    status: 'confirmed' as const,
    joinable: false,
    rsvp_dimitri: null,
    rsvp_theresa: null,
    added_by: 'discovery',
    source: r.source,
    source_id: r.source_id,
    url: r.url,
    image_url: r.image_url,
    tags: tagMap[r.title] ?? null,
  }))

  const { error } = await supabase.from('events').insert(rows)
  if (error) throw new Error(error.message)

  return { scraped: raw.length, inserted: rows.length, skipped: raw.length - rows.length }
}