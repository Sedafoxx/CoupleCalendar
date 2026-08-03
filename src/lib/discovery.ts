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

// UTC ISO datetime → Vienna "YYYY-MM-DD" + "HH:MM" (avoids UTC-midnight drift).
function utcToVienna(iso: string): { date: string; time: string } | null {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const str = d.toLocaleString('sv-SE', { timeZone: 'Europe/Vienna' }) // "YYYY-MM-DD HH:MM:SS"
  const [date, time] = str.split(' ')
  return { date, time: time.slice(0, 5) }
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

// ── Source: Resident Advisor (ra.co) — real club/rave/electronic nights ──────
const RA_GRAPHQL = 'https://ra.co/graphql'
const RA_AREA_ID = 450
const RA_DAYS_AHEAD = 30
const RA_MAX_EVENTS = 100

const RA_QUERY = `
query($from: DateTime!, $to: DateTime!, $page: Int!) {
  eventListings(
    filters: {
      areas: { eq: 450 }
      listingDate: { gte: $from, lte: $to }
    }
    pageSize: 50
    page: $page
  ) {
    data {
      id listingDate
      event {
        id title date startTime
        content
        venue { name address }
        artists { name }
        images { filename }
        pick { blurb }
      }
    }
    totalResults
  }
}
`

type RaListing = {
  id: string
  listingDate: string
  event: {
    id: string
    title: string
    date: string
    startTime: string | null
    content: string
    venue?: { name?: string; address?: string } | null
    artists?: { name: string }[]
    images?: { filename: string }[]
    pick?: { blurb?: string } | null
  }
}

export async function scrapeRa(): Promise<RawEvent[]> {
  const now = new Date()
  const from = now.toISOString()
  const to = new Date(now.getTime() + RA_DAYS_AHEAD * 24 * 60 * 60 * 1000).toISOString()

  const out: RawEvent[] = []
  let page = 1
  let total = Infinity

  while (out.length < RA_MAX_EVENTS && (page - 1) * 50 < total) {
    const res = await fetch(RA_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        Referer: 'https://ra.co/events/at/vienna',
        Origin: 'https://ra.co',
        'ra-content-language': 'en',
      },
      body: JSON.stringify({
        query: RA_QUERY.replace('{ eq: 450 }', `{ eq: ${RA_AREA_ID} }`),
        variables: { from, to, page },
      }),
    })
    if (!res.ok) throw new Error(`RA request failed: ${res.status}`)
    const json = await res.json()
    const listings: RaListing[] = json?.data?.eventListings?.data ?? []
    total = json?.data?.eventListings?.totalResults ?? listings.length
    if (!listings.length) break

    for (const item of listings) {
      const ev = item.event
      if (!ev?.title) continue

      const v = utcToVienna(ev.startTime || ev.date || item.listingDate)
      if (!v) continue

      const venue = ev.venue
      const venueLabel = [venue?.name, venue?.address].filter(Boolean).join(', ') || 'Wien'
      const img = ev.images?.[0]?.filename ? `https://ra.co${ev.images[0].filename}` : null

      out.push({
        source: 'ra',
        // RA reuses the same event id for multi-night runs (festivals etc.), so
        // include the date to keep each night a separate, dedupable row.
        source_id: `ra:${ev.id}:${v.date}`,
        title: ev.title,
        location: venueLabel,
        date: v.date,
        start_time: v.time,
        end_time: plusHours(v.time, 4), // no end in the listing — assume ~4h night
        url: `https://ra.co/events/${ev.id}`,
        image_url: img,
      })
    }
    page += 1
  }

  return out
}

// ── Source: ImPulsTanz (impulstanz.com) — Vienna contemporary dance festival ──
// Both the performance calendar and the side-events calendar are server-rendered
// with a clean "daycontainer → item (time, cie, titel, info/venue)" structure.
const IMPULSTANZ_PERF = 'https://www.impulstanz.com/calendar/performances/'
const IMPULSTANZ_EVENTS = 'https://www.impulstanz.com/calendar/events/'
const IMPULSTANZ_BASE = 'https://www.impulstanz.com/calendar/'
const IMPULSTANZ_MAX = 80

function stripHtml(s: string): string {
  return decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

async function scrapeImpulstanzPage(url: string, mode: 'perf' | 'events'): Promise<RawEvent[]> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`ImPulsTanz ${url} failed: ${res.status}`)
  const html = await res.text()
  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Vienna' }).slice(0, 10)
  const out: RawEvent[] = []

  // Split into day blocks — each "daycontainer" holds one day's items.
  const dayBlocks = html.split(/class=['"]daycontainer/)
  for (const block of dayBlocks.slice(1)) {
    let date: string | null = null
    const dm = block.match(/data-date='(\d{2})\/(\d{2})\/(\d{4})'/)
    if (dm) {
      date = `${dm[3]}-${dm[1]}-${dm[2]}`
    } else {
      // e.g. <div class='day'>Sonntag, 12.7.</div> — no year, assume festival year.
      const dl = block.match(/<div class='day'>[^<]*?(\d{1,2})\.(\d{1,2})\./)
      if (dl) date = `${new Date().getFullYear()}-${pad(+dl[2])}-${pad(+dl[1])}`
    }
    if (!date || date < today) continue

    const anchorRe = /<a[^>]*href='([^']*)'[^>]*>([\s\S]*?)<\/a>/g
    for (const m of block.matchAll(anchorRe)) {
      const href = m[1]
      const inner = m[2]
      if (!/<div class='time'>/.test(inner)) continue

      const time = inner.match(/<div class='time'>([^<]*)<\/div>/)?.[1]?.trim() || '20:00'
      const cie = stripHtml(inner.match(/<div class='cie'>([^<]*)<\/div>/)?.[1] ?? '')
      const titel = stripHtml(inner.match(/<div class='titel'>([^<]*)<\/div>/)?.[1] ?? '')
      const venue = stripHtml(inner.match(/<div class='info'>\s*<div>([^<]*)<\/div>/)?.[1] ?? '') || 'Wien'

      let title: string
      if (mode === 'perf') {
        title = titel ? (cie && cie !== titel ? `${titel} – ${cie}` : titel) : cie
      } else {
        title = cie ? (titel && titel !== cie ? `${cie} – ${titel}` : cie) : titel
      }
      if (!title) continue

      // Stable id: last URL segment + date + time (a show repeats per night).
      const slug = (href.match(/([^/]+)\/?$/) ?? [])[1] ?? ''
      const uid = slug ? `${slug}:${date}:${time}` : `${date}:${time}:${title.slice(0, 30)}`
      const absUrl = href.startsWith('http') ? href : `${IMPULSTANZ_BASE}${href}`

      out.push({
        source: 'impulstanz',
        source_id: `impulstanz:${uid}`,
        title,
        location: venue,
        date,
        start_time: time,
        end_time: plusHours(time, 2),
        url: absUrl,
        image_url: null,
      })
    }
  }
  return out
}

export async function scrapeImpulstanz(): Promise<RawEvent[]> {
  const [perf, ev] = await Promise.all([
    scrapeImpulstanzPage(IMPULSTANZ_PERF, 'perf').catch(e => { console.error('[impulstanz] performances failed', e); return [] as RawEvent[] }),
    scrapeImpulstanzPage(IMPULSTANZ_EVENTS, 'events').catch(e => { console.error('[impulstanz] events failed', e); return [] as RawEvent[] }),
  ])
  const seen = new Set<string>()
  const capped: RawEvent[] = []
  for (const r of [...perf, ...ev]) {
    if (seen.has(r.source_id)) continue
    seen.add(r.source_id)
    capped.push(r)
    if (capped.length >= IMPULSTANZ_MAX) break
  }
  return capped
}

// ── Source: Kultursommer Wien (kultursommer.wien) — free summer open-air festival ──
// The kalender page is a JS app, but it fetches events from a plain JSON API:
// POST kalender_2026.jartc with cmd=getEventsNew (paginated via sel-start/row-limit).
const KULTURSOMMER_API = 'https://www.kultursommer.wien/jart/prj3/festival/resources/dbcon-def/reports/apps/kalender_2026/kalender_2026.jartc'
const KULTURSOMMER_MAX = 200
const KULTURSOMMER_PAGE = 20

type KsSubmission = {
  ks_kuenstler?: string | null
  ks_projekttitel?: string | null
  ks_pr_foto_upload_1?: string | null
  from_time?: string | null
  to_time?: string | null
}
type KsSlot = {
  slot_id: string
  festival_day_date: string
  festival_slot_from?: string | null
  festival_slot_till?: string | null
  location_name?: string | null
  zip_code?: string | null
  submission_slot?: KsSubmission[]
}
type KsMonth = { value: string; display_value: string; slot?: KsSlot[] }

async function kultursommerPage(start: number, limit: number): Promise<{ months: KsMonth[]; total: number }> {
  const body = new URLSearchParams({
    cmd: 'getEventsNew',
    data: JSON.stringify({
      'sel-start': start,
      'row-limit': limit,
      '__j-language-file': '/prj3/festival/releases/de/lang-config.json',
      '__lang': 'de',
    }),
  }).toString()
  const res = await fetch(KULTURSOMMER_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: 'https://www.kultursommer.wien/kalender',
      'User-Agent': 'Mozilla/5.0',
    },
    body,
  })
  if (!res.ok) throw new Error(`Kultursommer API failed: ${res.status}`)
  const json = await res.json()
  return { months: json.month ?? [], total: Number(json.sub_count ?? 0) }
}

export async function scrapeKultursommer(): Promise<RawEvent[]> {
  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Vienna' }).slice(0, 10)
  const seen = new Set<string>()
  const out: RawEvent[] = []
  let start = 0
  let total = Infinity

  while (out.length < KULTURSOMMER_MAX && start < total) {
    const { months, total: t } = await kultursommerPage(start, KULTURSOMMER_PAGE)
    total = t
    let got = 0

    for (const month of months) {
      const year = (month.display_value ?? '').match(/(\d{4})/)?.[1]
      if (!year) continue
      for (const slot of month.slot ?? []) {
        got++
        // festival_day_date is "Di 4.8." — day + month (year comes from the month block).
        const dm = slot.festival_day_date?.match(/(\d{1,2})\.(\d{1,2})\./)
        if (!dm) continue
        const date = `${year}-${month.value}-${pad(+dm[1])}`
        if (date < today) continue

        const sub = slot.submission_slot?.[0]
        if (!sub) continue
        const artist = decode(sub.ks_kuenstler ?? '')
        const proj = decode(sub.ks_projekttitel ?? '')
        const title = artist ? (proj ? `${artist} – ${proj}` : artist) : (proj || 'Kultursommer Event')

        const startTime = (sub.from_time ?? slot.festival_slot_from ?? '20:00').slice(0, 5)
        const rawEnd = (sub.to_time ?? slot.festival_slot_till ?? '').slice(0, 5)
        const endTime = rawEnd && rawEnd > startTime ? rawEnd : plusHours(startTime, 1)
        const location = [slot.zip_code ? `${slot.zip_code}.` : '', slot.location_name ?? ''].filter(Boolean).join(' ') || 'Wien'

        const uid = `kultursommer:${slot.slot_id}`
        if (seen.has(uid)) continue
        seen.add(uid)
        out.push({
          source: 'kultursommer',
          source_id: uid,
          title,
          location,
          date,
          start_time: startTime,
          end_time: endTime,
          url: `https://www.kultursommer.wien/kalender?slot_id=${slot.slot_id}`,
          image_url: sub.ks_pr_foto_upload_1
            ? `https://www.kultursommer.wien/jart/pub-prc/img.jart?base=/prj3/festival&img=/data/fotos/${sub.ks_pr_foto_upload_1}`
            : null,
        })
      }
    }

    if (got === 0) break
    start += KULTURSOMMER_PAGE
  }
  return out
}

const SOURCES: Array<() => Promise<RawEvent[]>> = [scrapeGogogo, scrapeYesticket, scrapeRa, scrapeImpulstanz, scrapeKultursommer]

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

  // 2. Dedup against what we already imported, then against duplicates *within*
  //    this batch (a source can emit the same id twice across pages).
  const ids = raw.map(r => r.source_id)
  const { data: existing } = await supabase
    .from('events')
    .select('source_id')
    .in('source_id', ids)
  const known = new Set((existing ?? []).map(e => e.source_id))
  const seen = new Set<string>()
  const fresh = raw.filter(r => {
    if (known.has(r.source_id) || seen.has(r.source_id)) return false
    seen.add(r.source_id)
    return true
  })

  if (!fresh.length) return { scraped: raw.length, inserted: 0, skipped: raw.length }

  // 3. AI-tag by vibe.
  const tagMap = await tagForDates(fresh.slice(0, 100).map(r => r.title))

  // 4. Insert as browsable city suggestions (nobody's committed yet).
  const rows = fresh.map(r => ({
    title: r.title,
    location: r.location,
    date: r.date,
    start_time: r.start_time,
    end_time: r.end_time,
    type: 'single' as const,
    category: 'city' as const,
    status: 'proposed' as const,
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