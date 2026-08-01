import OpenAI from 'openai'
import { isTheresaAuthed } from '@/lib/theresa-auth'
import { supabase } from '@/lib/supabase'
import { getCalendarClient } from '@/lib/google-auth'
import { getFreeBusySlots } from '@/lib/freebusy'
import { NextRequest } from 'next/server'
import { getViennaWeather, weatherSummary, categorizeItem, feasibilityReason } from '@/lib/weather'
import { fetchPage } from '@/lib/fetch-page'

const openai = new OpenAI()

function getViennaOffset(dateStr: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Vienna',
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date(`${dateStr}T12:00:00Z`))
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+02:00'
  const raw = tzName.replace('GMT', '')
  const match = raw.match(/^([+-])(\d+)(?::(\d{2}))?$/)
  if (!match) return '+02:00'
  return `${match[1]}${match[2].padStart(2, '0')}:${match[3] ?? '00'}`
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function hhmmss(t: string | null | undefined): string {
  const [h = '00', m = '00', s = '00'] = (t ?? '').split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`
}

// Is there already an event with this title on this day in Google Calendar?
async function googleHasMatch(
  calendar: Awaited<ReturnType<typeof getCalendarClient>>,
  summary: string,
  date: string,
): Promise<boolean> {
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

// Each night Theresa stays = one 22:00→08:00(next day) entry. Inclusive range.
function nightsBetween(start: string, end: string | null): string[] {
  const last = end && end !== start ? end : start
  const out: string[] = []
  let cur = start
  while (cur <= last) {
    out.push(cur)
    cur = addOneDay(cur)
  }
  return out
}

function fmtDay(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function sleepoverWhen(date: string, endDate: string | null): string {
  return endDate && endDate !== date
    ? `${fmtDay(date)} – ${fmtDay(endDate)}`
    : `on ${fmtDay(date)}`
}

function fmtSlots(slots: { date: string; freeSlots: { start: string; end: string }[] }[]): string {
  if (!slots.length) return 'Keine freien Zeiten gefunden.'
  return slots.slice(0, 7).map(({ date, freeSlots }) => {
    const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('de-AT', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    const times = freeSlots.map(s => {
      const from = new Date(s.start).toLocaleTimeString('de-AT', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit' })
      const to = new Date(s.end).toLocaleTimeString('de-AT', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit' })
      return `${from}–${to} Uhr`
    }).join(', ')
    return `${dateLabel}: ${times}`
  }).join('\n')
}

type PlannedEvent = {
  title: string
  location: string | null
  date: string
  start_time: string | null
  end_time: string | null
  type: string | null
  end_date: string | null
  recurrence_rule: string | null
  added_by: string | null
}

function fmtEvents(events: PlannedEvent[]): string {
  if (!events.length) return 'Noch keine geplanten Events.'
  return events.map(e => {
    const who = e.added_by === 'theresa' ? ' (von Theresa ♡)' : ''
    const loc = e.location ? ` @ ${e.location}` : ''
    let when: string
    if (e.type === 'sleepover') {
      when = e.end_date && e.end_date !== e.date
        ? `${fmtDay(e.date)} – ${fmtDay(e.end_date)} · Übernachtung 🌙`
        : `${fmtDay(e.date)} · Übernachtung 🌙`
    } else if (e.type === 'window' && e.end_date) {
      when = `${fmtDay(e.date)} – ${fmtDay(e.end_date)} (ganztägig)`
    } else if (e.type === 'recurring' && e.recurrence_rule) {
      when = `${e.recurrence_rule} (wiederkehrend, ab ${fmtDay(e.date)})`
    } else {
      when = `${fmtDay(e.date)} · ${e.start_time ?? '??'}–${e.end_time ?? '??'} Uhr`
    }
    return `- ${e.title}${loc} — ${when}${who}`
  }).join('\n')
}

// Self-healing sync: make sure every upcoming Theresa-added event exists in
// Google Calendar, regardless of what the chat AI decides. Catches events
// whose original insert failed (e.g. created while the OAuth token was dead).
// Idempotent — one list call, then inserts only what's missing.
async function reconcileTheresaEvents(events: PlannedEvent[], today: string): Promise<void> {
  const targets = events.filter(e =>
    e.added_by === 'theresa' &&
    (e.type === 'single' || e.type === 'window' || e.type === 'sleepover') &&
    (e.date >= today || (e.end_date != null && e.end_date >= today))
  )
  if (!targets.length) return

  const calendar = await getCalendarClient()
  const maxDate = targets.reduce((mx, e) => {
    const d = e.end_date && e.end_date > e.date ? e.end_date : e.date
    return d > mx ? d : mx
  }, today)

  const list = await calendar.events.list({
    calendarId: 'primary',
    timeMin: `${today}T00:00:00Z`,
    timeMax: `${addOneDay(maxDate)}T00:00:00Z`,
    singleEvents: true,
    maxResults: 2500,
  })
  const dayOf = (s: { date?: string | null; dateTime?: string | null } | undefined) =>
    s?.date ?? (s?.dateTime ? new Date(s.dateTime).toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' }) : '')
  const present = new Set(
    (list.data.items ?? []).map(it => `${(it.summary ?? '').trim().toLowerCase()}|${dayOf(it.start)}`)
  )
  const has = (summary: string, day: string) => present.has(`${summary.trim().toLowerCase()}|${day}`)

  for (const e of targets) {
    try {
      if (e.type === 'sleepover') {
        for (const night of nightsBetween(e.date, e.end_date || null)) {
          if (has('Theresa', night)) continue
          const morning = addOneDay(night)
          await calendar.events.insert({
            calendarId: 'primary',
            requestBody: {
              summary: 'Theresa',
              start: { dateTime: `${night}T22:00:00${getViennaOffset(night)}` },
              end: { dateTime: `${morning}T08:00:00${getViennaOffset(morning)}` },
            },
          })
        }
      } else if (e.type === 'single') {
        if (has(e.title, e.date)) continue
        const off = getViennaOffset(e.date)
        await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: e.title,
            location: e.location || '',
            start: { dateTime: `${e.date}T${hhmmss(e.start_time)}${off}` },
            end: { dateTime: `${e.date}T${hhmmss(e.end_time)}${off}` },
          },
        })
      } else {
        if (has(e.title, e.date)) continue
        await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: e.title,
            location: e.location || '',
            start: { date: e.date },
            end: { date: addOneDay(e.end_date || e.date) },
          },
        })
      }
      console.log(`[reconcile] synced "${e.title}" (${e.date}) to Google`)
    } catch (err) {
      console.error(`[reconcile] failed for "${e.title}" (${e.date}):`, err)
    }
  }
}

function buildSystemPrompt(freeBusySummary: string, plannedEventsSummary: string, bucketListSummary: string, calendarConnected: boolean, weatherContextStr: string, standingPlansSummary: string, fetchedContent: string): string {
  const today = new Date().toISOString().split('T')[0]

  const availabilitySection = calendarConnected
    ? `Dimitris freie Zeiten (Wien-Zeit):
${freeBusySummary}`
    : `⚠️ WICHTIG: Dimitris Google-Kalender ist gerade NICHT erreichbar — ich kann seine freien Zeiten nicht sehen.
Sage Theresa in dieser Antwort liebevoll, dass sie Dimitri Bescheid geben soll: der Zugriff auf seinen Google-Kalender muss repariert werden (neu verbinden / einloggen).
Behaupte KEINE freien Zeiten, schlage KEINE konkreten Slots vor und erstelle KEINE zeitgebundenen Events (kein single). Bucket-List-Einträge und Notizen sind weiterhin ok.`

  const now = new Date()
  const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
  const dayOfWeek = dayNames[now.getDay()]
  const month = now.toLocaleDateString('de-AT', { month: 'long' })
  const season = now.getMonth() >= 2 && now.getMonth() <= 4 ? 'Frühling'
    : now.getMonth() >= 5 && now.getMonth() <= 7 ? 'Sommer'
    : now.getMonth() >= 8 && now.getMonth() <= 10 ? 'Herbst'
    : 'Winter'
  const hour = now.getHours()

  return `Du bist Zoey, ein liebevoller smarter Kalenderassistent für Dimitri und Theresa. Heute ist ${today}.

AKTUELLER KONTEXT:
- Heute: ${today} (${dayOfWeek})
- Monat: ${month}, Jahreszeit: ${season}
- Uhrzeit: ${hour}:${String(now.getMinutes()).padStart(2, '0')} Uhr
- Wetter in Wien:
${weatherContextStr || 'Wetter nicht verfügbar.'}

Du hilfst Theresa dabei, gemeinsame Zeit mit Dimitri zu planen. Theresa kann Events direkt erstellen — keine Bestätigung nötig.

${availabilitySection}

Bereits geplante Events (kommende, inkl. von Theresa eingetragene):
${plannedEventsSummary}

Eure Bucket-List (Dinge die ihr noch tun wollt):
${bucketListSummary || 'Noch leer — füge etwas hinzu!'}

Du kannst sechs Aktionen ausführen:
1. "ask" — Eine Eingrenzungs-Frage stellen wenn es zu viele Optionen gibt
2. "suggest" — Konkrete Vorschläge mit Optionen präsentieren
3. "create_event" — Ein Event direkt erstellen
4. "add_bucket_list" — Zur Bucket List hinzufügen
5. "add_known_link" — Eine URL als bekannte Quelle speichern (z.B. Show-Termine)
6. "none" — Nur chatten

────────────────────────
WIEDERKEHRENDE PLÄNE (STANDING PLANS):
────────────────────────
${standingPlansSummary || 'Keine wiederkehrenden Pläne bekannt.'}
Diese sind feste wöchentliche Termine. Plane KEINE Konflikte damit und erwähne sie natürlich wenn relevant.

────────────────────────
AKTUELL ABGERUFENE WEBSITE-INHALTE (Verfügbarkeits-Check):
────────────────────────
${fetchedContent || 'Keine Website abgerufen.'}
Nutze diese Infos um konkrete Termine/Verfügbarkeiten zu nennen (z.B. Improtheater-Show-Daten).

Du kannst fünf Arten von Events erstellen:
1. **single** – bestimmtes Datum und Uhrzeit (Konzert, Abendessen, Kino). Braucht: title, date, start_time, end_time.
2. **window** – über mehrere Tage aktiv, keine feste Zeit (Zirkus, Festival, Ausstellung). Braucht: title, date (Start), end_date.
3. **recurring** – wiederkehrend (jeden Donnerstag, wöchentliches Kochen). Braucht: title, date (erste Occurrence), recurrence_rule Format "weekly:DAY".
4. **bucket_list** – noch kein Datum, irgendwann machen. Braucht: title, optionale description/tags/duration_days.
5. **sleepover** – Theresa bleibt bei Dimitri über Nacht. Braucht: date (erste Übernachtungsnacht). Für mehrere Nächte zusätzlich end_date = die LETZTE Nacht in der sie bleibt (nicht der Abreisetag). Eine Nacht → nur date. Keine Uhrzeit nötig (im Kalender wird automatisch 22:00–08:00 eingetragen). Wenn sie sagt "ich schlaf heute/Samstag bei dir", "ich bleib über", "ich übernachte" → type sleepover. title z.B. "Theresa bleibt über 🌙".

Antworte immer auf Deutsch in exakt diesem JSON-Format:
{
  "reply": "liebevolle, warme Antwort auf Deutsch",
  "action": "ask | suggest | create_event | add_bucket_list | add_known_link | none",
  "event": {
    "type": "single | window | recurring | sleepover",
    "title": "Name des Events",
    "location": "Ort oder leerer String",
    "date": "YYYY-MM-DD",
    "start_time": "HH:MM",
    "end_time": "HH:MM",
    "end_date": "YYYY-MM-DD",
    "recurrence_rule": "weekly:thursday"
  } | null,
  // FÜR "ask" (Eingrenzungsfrage):
  "narrowing": {
    "question": "Eher was zum Essen/Trinken, Gemütliches oder Action?",
    "options": [
      { "label": "🍽️ Essen/Trinken", "category": "food" },
      { "label": "🛋️ Gemütlich", "category": "cozy" },
      { "label": "⚡ Action", "category": "action" }
    ]
  } | null,

  // FÜR "suggest" (konkrete Vorschläge):
  "suggestions": [
    {
      "title": "Aktivitätsname",
      "category": "weather_dependent | social | travel | seasonal | immediate",
      "feasible": true,
      "reasoning": "Warum das jetzt gut passt",
      "options": [
        { "label": "Heute 14-16 Uhr", "event": { "type": "single", "title": "...", "date": "YYYY-MM-DD", "start_time": "14:00", "end_time": "16:00", "location": "" } }
      ]
    }
  ] | null,

  "bucket_list_item": {
    "title": "Aktivität",
    "description": "kurze Beschreibung",
    "tags": ["romantic", "adventure", "food", "culture", "outdoor", "sport"],
    "duration_days": null
  } | null,

  // FÜR "add_known_link" (User gibt eine URL als Quelle an):
  "known_link": {
    "title": "Kurzbezeichnung",
    "url": "https://...",
    "purpose": "Wofür ist die Seite gut",
    "keywords": ["impro", "improtheater"]
  } | null
}

Regeln:
- Wenn Theresa fragt was an einem Tag/Datum geplant ist oder los ist, schau in "Bereits geplante Events" und zähle die passenden Einträge auf. Behaupte nie "keine Events" ohne dort nachgesehen zu haben.
- Wenn Theresa ausdrücklich ein bereits in "Bereits geplante Events" vorhandenes Event eintragen / in den Kalender legen / "trag ihm ... ein" will, gib trotzdem action create_event mit den exakten Event-Details (gleicher title und date) zurück, damit es mit Dimitris Google-Kalender synchronisiert wird. Antworte nicht nur "schon eingetragen".
- Doppelbuchungen vermeiden: weise freundlich hin wenn ein neuer Slot mit einem bestehenden Event kollidiert
- Schau dir Dimitris freie Zeiten an und schlage passende Slots vor wenn sie fragt
- Relative Daten ("diesen Samstag", "nächste Woche"): berechne von heute (${today})
- Für single Events: wenn kein end_time, füge 2 Stunden zur start_time hinzu
- Für window Events: end_date Pflichtfeld, keine start_time/end_time
- recurrence_rule Format: "weekly:DAYNAME" auf Englisch (z.B. "weekly:thursday")
- sleepover: nur date setzen (eine Nacht), oder date + end_date (mehrere Nächte). Keine start_time/end_time. Dimitri wird automatisch benachrichtigt.
- Bucket-List Tags nur aus: romantic, adventure, food, culture, outdoor, sport
- location: leerer String wenn unbekannt
- Wenn gespeichert, freundlich bestätigen
- Bei action "none" nur chatten oder Fragen beantworten

────────────────────────
FEASIBILITY-ANALYSE — Wenn der User nach Vorschlägen fragt:
────────────────────────
Prüfe JEDEN Bucket-List-Eintrag auf Machbarkeit:
- **weather_dependent** (outdoor/Sport/Schwimmen): Wetter prüfen
- **social** (mit Freunden): 3+ Tage Vorlauf nötig
- **travel** (Prag, Roadtrip): Wochenende einplanen
- **seasonal** (Christkindlmarkt): Richtige Jahreszeit?
- **immediate** (Kino, Café): Immer möglich

────────────────────────
EINGRENZUNG (action: "ask"):
────────────────────────
Wenn 4+ machbare Vorschläge → Frage mit 2-4 Kategorien:
🍽️ Essen/Trinken · 🛋️ Gemütlich · ⚡ Action · 🎭 Kultur · 👥 Mit Freunden

────────────────────────
KOMBINATIONS-VORSCHLÄGE:
────────────────────────
Schau dir die KOMMENDE EVENTS an. Wenn ein Event bald ist (z.B. "Abendessen mit Freunden"), schlage vor ob man was kombinieren kann.
Z.B.: "Ihr habt am Samstag Abendessen mit X — wollt ihr vorher Minigolf machen?"
Z.B.: "Am Freitag seid ihr frei — Kinoabend?"`
}

export async function POST(req: NextRequest) {
  if (!isTheresaAuthed(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const message = formData.get('message') as string | null
  const imageFile = formData.get('image') as File | null

  if (!message?.trim() && !imageFile) {
    return Response.json({ error: 'No message or image' }, { status: 400 })
  }

  // Fetch freebusy, bucket list, already-planned events, weather, known links, standing plans
  const [freeBusyResult, bucketListResult, eventsResult, weatherResult, linksResult, plansResult] = await Promise.allSettled([
    getFreeBusySlots(),
    supabase.from('bucket_list').select('title, description, tags, duration_days').eq('resolved', false).order('created_at', { ascending: false }),
    supabase.from('events').select('title, location, date, start_time, end_time, type, end_date, recurrence_rule, added_by').order('date', { ascending: true }),
    getViennaWeather(),
    supabase.from('known_links').select('title, url, purpose, keywords'),
    supabase.from('events').select('title, recurrence_rule').not('recurrence_rule', 'is', null).limit(20),
  ])

  // A rejected freebusy result means we genuinely couldn't reach Dimitri's
  // Google calendar (e.g. expired/revoked OAuth token). Treat that distinctly
  // from "connected but no slots" so the bot tells Theresa to flag it to
  // Dimitri instead of silently claiming he has no free time.
  const calendarConnected = freeBusyResult.status === 'fulfilled'
  if (!calendarConnected) {
    console.error('[theresa/chat] freebusy unavailable:', freeBusyResult.reason)
  }
  const freeSlots = calendarConnected ? freeBusyResult.value : []
  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null
  const weatherContextStr = weather ? weatherSummary(weather) : 'Nicht verfügbar.'
  const bucketListData = bucketListResult.status === 'fulfilled' ? bucketListResult.value.data : []

  const freeBusySummary = calendarConnected ? fmtSlots(freeSlots) : ''
  // Build pre-categorised bucket list with feasibility analysis
  const dayOfWeekNum = new Date().getDay()
  const enrichedBucketList = bucketListData?.length
    ? bucketListData.map(i => {
        const cat = categorizeItem(i.title, i.tags)
        const { feasible, reasoning } = feasibilityReason(cat, weather, today, dayOfWeekNum)
        return `- ${i.title}${i.description ? ': ' + i.description : ''}${i.tags?.length ? ' [' + i.tags.join(', ') + ']' : ''} [${cat}] ${feasible ? '✅' : '⏳'} ${reasoning}`
      }).join('\n')
    : ''
  const bucketListSummary = enrichedBucketList || ''

  // Show only current/upcoming events: future-dated, or multi-day windows still ongoing.
  const today = new Date().toISOString().split('T')[0]
  const eventsData = (eventsResult.status === 'fulfilled' ? eventsResult.value.data : []) as PlannedEvent[] | null
  const upcomingEvents = (eventsData ?? [])
    .filter(e => e.date >= today || (e.end_date != null && e.end_date >= today))
    .slice(0, 40)
  const plannedEventsSummary = fmtEvents(upcomingEvents)

  // Standing plans = recurring events (e.g. Neubau tanzt every Thursday)
  const plansData = plansResult.status === 'fulfilled' ? plansResult.value.data : []
  const standingPlansSummary = (plansData ?? []).length
    ? (plansData ?? []).map((p: { title: string; recurrence_rule: string | null }) => `- ${p.title} (${p.recurrence_rule})`).join('\n')
    : ''

  // Known links: if the user's message mentions a keyword, fetch the page.
  const linksData = linksResult.status === 'fulfilled' ? linksResult.value.data : []
  const msgLower = (message ?? '').toLowerCase()
  let fetchedContent = ''
  for (const link of (linksData ?? []) as { title: string; url: string; keywords: string[] | null }[]) {
    const kws = (link.keywords ?? []).map((k: string) => k.toLowerCase())
    const match = kws.some(k => msgLower.includes(k)) ||
      (link.title && msgLower.includes(link.title.toLowerCase()))
    if (match) {
      const page = await fetchPage(link.url)
      if (page) {
        fetchedContent = `[${link.title}] (${link.url}):\n${page.text}`
      }
      break
    }
  }

  // Self-heal: ensure Theresa's plans are actually in Google, even if a prior
  // insert failed. Independent of the AI's decision, so it can't be skipped.
  if (calendarConnected) {
    try {
      await reconcileTheresaEvents(upcomingEvents, today)
    } catch (err) {
      console.error('[theresa/chat] reconcile failed:', err)
    }
  }

  const userContent: OpenAI.ChatCompletionContentPart[] = []

  if (imageFile) {
    const bytes = await imageFile.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mediaType = imageFile.type || 'image/jpeg'
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${mediaType};base64,${base64}`, detail: 'high' },
    })
  }

  userContent.push({
    type: 'text',
    text: message?.trim() || 'Was ist auf diesem Bild? Extrahiere alle Details.',
  })

  let gptText = ''
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1536,
      messages: [
        { role: 'system', content: buildSystemPrompt(freeBusySummary, plannedEventsSummary, bucketListSummary, calendarConnected, weatherContextStr, standingPlansSummary, fetchedContent) },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
    })
    gptText = res.choices[0]?.message?.content ?? ''
  } catch {
    return Response.json({ reply: 'KI nicht erreichbar. Bitte nochmal versuchen.' })
  }

  type AiEvent = {
    type: string
    title: string
    location: string
    date: string
    start_time: string
    end_time: string
    end_date: string
    recurrence_rule: string
  }
  type AiBucketItem = {
    title: string
    description: string
    tags: string[]
    duration_days: number | null
  }
  type AiKnownLink = {
    title: string
    url: string
    purpose: string
    keywords: string[]
  }
  type AiResponse = {
    reply: string
    action: 'ask' | 'suggest' | 'create_event' | 'add_bucket_list' | 'add_known_link' | 'none'
    narrowing?: { question: string; options: { label: string; category: string }[] } | null
    suggestions?: { title: string; category: string; feasible: boolean; reasoning: string; options: { label: string; event: Record<string, unknown> }[] }[] | null
    event: AiEvent | null
    bucket_list_item: AiBucketItem | null
    known_link?: AiKnownLink | null
  }

  let parsed: AiResponse
  try {
    parsed = JSON.parse(gptText)
  } catch {
    return Response.json({ reply: gptText })
  }

  // Pass through narrowing / suggestions for the UI
  if (parsed.action === 'ask' || parsed.action === 'suggest') {
    return Response.json({
      reply: parsed.reply,
      action: parsed.action,
      narrowing: parsed.narrowing ?? null,
      suggestions: parsed.suggestions ?? null,
    })
  }

  let savedEvent = null
  let savedEventIsNew = false
  let savedBucketItem = null

  if (parsed.action === 'create_event' && parsed.event?.title) {
    const ev = parsed.event
    const type = ev.type ?? 'single'

    // Reuse an existing DB row if this event already exists (keyed title+date),
    // so explicitly re-entering it doesn't create a duplicate — we still
    // reconcile it to Google below.
    const { data: existing } = await supabase
      .from('events')
      .select('*')
      .eq('title', ev.title)
      .eq('date', ev.date)
      .limit(1)
      .maybeSingle()

    if (existing) {
      savedEvent = existing
    } else {
      const { data, error } = await supabase
        .from('events')
        .insert({
          title: ev.title,
          location: ev.location || '',
          date: ev.date,
          start_time: ev.start_time || '00:00',
          end_time: ev.end_time || ev.start_time || '00:00',
          type,
          end_date: ev.end_date || null,
          recurrence_rule: ev.recurrence_rule || null,
          added_by: 'theresa',
        })
        .select()
        .single()
      if (!error) {
        savedEvent = data
        savedEventIsNew = true
      }
    }

    // Ensure Google Calendar has it. Idempotent: skip anything already present,
    // so reconciling an existing event never double-books.
    if (savedEvent && (savedEvent.type === 'single' || savedEvent.type === 'window' || savedEvent.type === 'sleepover')) {
      try {
        const calendar = await getCalendarClient()
        if (savedEvent.type === 'single') {
          if (!(await googleHasMatch(calendar, savedEvent.title, savedEvent.date))) {
            const offset = getViennaOffset(savedEvent.date)
            await calendar.events.insert({
              calendarId: 'primary',
              requestBody: {
                summary: savedEvent.title,
                location: savedEvent.location || '',
                start: { dateTime: `${savedEvent.date}T${hhmmss(savedEvent.start_time)}${offset}` },
                end: { dateTime: `${savedEvent.date}T${hhmmss(savedEvent.end_time)}${offset}` },
              },
            })
          }
        } else if (savedEvent.type === 'sleepover') {
          // One "Theresa" entry per night, 22:00 → 08:00 next morning.
          for (const night of nightsBetween(savedEvent.date, savedEvent.end_date || null)) {
            if (await googleHasMatch(calendar, 'Theresa', night)) continue
            const morning = addOneDay(night)
            await calendar.events.insert({
              calendarId: 'primary',
              requestBody: {
                summary: 'Theresa',
                start: { dateTime: `${night}T22:00:00${getViennaOffset(night)}` },
                end: { dateTime: `${morning}T08:00:00${getViennaOffset(morning)}` },
              },
            })
          }
        } else {
          // window: all-day, end exclusive.
          if (!(await googleHasMatch(calendar, savedEvent.title, savedEvent.date))) {
            await calendar.events.insert({
              calendarId: 'primary',
              requestBody: {
                summary: savedEvent.title,
                location: savedEvent.location || '',
                start: { date: savedEvent.date },
                end: { date: addOneDay(savedEvent.end_date || savedEvent.date) },
              },
            })
          }
        }
      } catch (calErr) {
        console.error('[Google Cal] insert failed:', calErr)
      }
    }
  } else if (parsed.action === 'add_bucket_list' && parsed.bucket_list_item?.title) {
    const item = parsed.bucket_list_item
    const { data, error } = await supabase
      .from('bucket_list')
      .insert({
        title: item.title,
        description: item.description || null,
        tags: item.tags?.length ? item.tags : null,
        duration_days: item.duration_days || null,
        added_by: 'theresa',
      })
      .select()
      .single()

    if (!error) savedBucketItem = data
  }

  // Notify Dimitri about anything Theresa just booked/confirmed.
  // Only for genuinely new events — not when we merely reconciled an
  // existing one to Google (avoids duplicate "Theresa booked" pings).
  if (savedEvent && savedEventIsNew) {
    await supabase.from('notifications').insert({
      message:
        savedEvent.type === 'sleepover'
          ? `🌙 Theresa is staying over ${sleepoverWhen(savedEvent.date, savedEvent.end_date)}`
          : `💕 Theresa booked: ${savedEvent.title} (${fmtDay(savedEvent.date)})`,
      kind: savedEvent.type === 'sleepover' ? 'sleepover' : 'event',
      event_id: savedEvent.id,
    })
  } else if (savedBucketItem) {
    await supabase.from('notifications').insert({
      message: `✨ Theresa added to the bucket list: ${savedBucketItem.title}`,
      kind: 'bucket_list',
    })
  } else if (parsed.action === 'add_known_link' && parsed.known_link?.url) {
    const link = parsed.known_link
    await supabase.from('known_links').insert({
      title: link.title || link.url,
      url: link.url,
      purpose: link.purpose || null,
      keywords: link.keywords?.length ? link.keywords : null,
    })
  }

  return Response.json({ reply: parsed.reply, event: savedEvent, bucket_list_item: savedBucketItem })
}
