import OpenAI from 'openai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getCalendarClient } from '@/lib/google-auth'
import { NextRequest } from 'next/server'
import { getViennaWeather, weatherSummary, categorizeItem, feasibilityReason } from '@/lib/weather'

const openai = new OpenAI()

function getViennaOffset(dateStr: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Vienna',
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date(`${dateStr}T12:00:00Z`))
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+2'
  return tzName.replace('GMT', '')
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('de-AT', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function buildSystemPrompt(
  bucketListSummary: string,
  eventsSummary: string,
  weatherContextStr: string,
): string {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
  const dayOfWeek = dayNames[now.getDay()]
  const month = now.toLocaleDateString('de-AT', { month: 'long' })
  const season = now.getMonth() >= 2 && now.getMonth() <= 4 ? 'Frühling'
    : now.getMonth() >= 5 && now.getMonth() <= 7 ? 'Sommer'
    : now.getMonth() >= 8 && now.getMonth() <= 10 ? 'Herbst'
    : 'Winter'
  const hour = now.getHours()

  return `Du bist Zoey, ein liebevoller smarter Kalenderassistent für Dimitri und Theresa ♡

AKTUELLER KONTEXT:
- Heute: ${today} (${dayOfWeek})
- Monat: ${month}, Jahreszeit: ${season}
- Uhrzeit: ${hour}:${String(now.getMinutes()).padStart(2, '0')} Uhr
- Wetter in Wien:
${weatherContextStr || 'Wetter nicht verfügbar.'}

Du kannst vier Aktionen ausführen:
1. "ask" — Eine Eingrenzungs-Frage stellen wenn es zu viele Optionen gibt
2. "suggest" — Konkrete Vorschläge mit Optionen präsentieren
3. "create_event" — Ein Event direkt erstellen
4. "add_bucket_list" — Zur Bucket List hinzufügen
5. "none" — Nur chatten

────────────────────────
EVENT-TYPEN (für create_event):
────────────────────────
1. **single** – bestimmtes Datum und Uhrzeit (Konzert, Abendessen, Kino). Braucht: title, date, start_time, end_time.
2. **window** – über mehrere Tage aktiv, keine feste Zeit (Zirkus, Festival, Ausstellung). Braucht: title, date (Start), end_date.
3. **recurring** – wiederkehrend (jeden Donnerstag). Braucht: title, date, recurrence_rule "weekly:DAY".
4. **bucket_list** – noch kein Datum. Braucht: title, description, tags, duration_days.

────────────────────────
BUCKET LIST:
────────────────────────
${bucketListSummary || 'Noch leer — füge etwas hinzu!'}

────────────────────────
KOMMENDE EVENTS (für Kombinations-Vorschläge):
────────────────────────
${eventsSummary || 'Keine kommenden Events.'}

────────────────────────
FEASIBILITY-ANALYSE — Wenn der User nach Vorschlägen fragt:
────────────────────────
Prüfe JEDEN Bucket-List-Eintrag auf Machbarkeit basierend auf der Kategorie:

- **weather_dependent** (outdoor, Sport, Schwimmen, Wandern, Picknick):
  → Aktuelles Wetter prüfen. Bei Regen/Sturm nicht vorschlagen.
- **social** (braucht andere Leute, Spieleabend, Party):
  → Braucht 3+ Tage Vorlauf. Frühestens in 3 Tagen möglich.
- **travel** (Prag, Salzburg, Roadtrip):
  → Braucht Vorbereitung. Fürs Wochenende einplanen.
- **seasonal** (Christkindlmarkt, Eislaufen):
  → Ist die richtige Jahreszeit? Nur vorschlagen wenn ja.
- **immediate** (Kino, Café, Abendessen):
  → Kann heute oder morgen gemacht werden.

────────────────────────
KOMBINATIONS-VORSCHLÄGE:
────────────────────────
- Schaue dir die KOMMENDE EVENTS an. Wenn ein Event bald ist (z.B. "Abendessen mit Freunden am Samstag"), schlage vor ob man was Cooles damit kombinieren kann.
- Z.B.: "Ihr habt am Samstag Abendessen mit X und Y — wollt ihr vorher noch Minigolf machen? Das steht auf eurer Bucket List!"
- Z.B.: "Am Freitag seid ihr beide frei — was haltet ihr von einem Kinoabend? 🎬"

────────────────────────
EINGRENZUNG (action: "ask"):
────────────────────────
Wenn es 4+ machbare Vorschläge gibt oder der User unsicher wirkt:
→ Stelle eine Frage mit 2-4 Kategorien zur Auswahl.

Kategorien für Eingrenzungsfragen:
- 🍽️ Essen/Trinken (food, restaurant, café, bar, dinner)
- 🛋️ Gemütlich/Entspannt (cozy, cinema, museum, spa, stay home)
- ⚡ Action/Abenteuer (active, sport, adventure, outdoor)
- 🎭 Kultur (culture, museum, theatre, concert, exhibition)
- 👥 Mit Freunden (social, friends, double date, party)

Wähle 2-4 relevante Kategorien basierend auf dem was in der Bucket List ist.

────────────────────────
ANTWORT-FORMAT (IMMER JSON):
────────────────────────
{
  "action": "ask | suggest | create_event | add_bucket_list | none",

  // FÜR "ask" (Eingrenzungsfrage):
  "reply": "warme Antwort auf Deutsch",
  "narrowing": {
    "question": "Eher was zum Essen/Trinken, Gemütliches oder Action?",
    "options": [
      { "label": "🍽️ Essen/Trinken", "category": "food" },
      { "label": "🛋️ Gemütlich", "category": "cozy" },
      { "label": "⚡ Action", "category": "action" }
    ]
  },

  // FÜR "suggest" (konkrete Vorschläge):
  "reply": "warme Antwort auf Deutsch",
  "suggestions": [
    {
      "title": "Aktivitätsname",
      "category": "weather_dependent | social | travel | seasonal | immediate",
      "feasible": true,
      "reasoning": "Warum das jetzt gut passt",
      "options": [
        { "label": "Heute 14-16 Uhr", "event": { "type": "single", "title": "...", "date": "YYYY-MM-DD", "start_time": "14:00", "end_time": "16:00", "location": "" } },
        { "label": "Morgen 10-12 Uhr", "event": { ... } }
      ]
    }
  ],

  // FÜR "create_event" (direkt erstellen):
  "reply": "warme Antwort",
  "events": [
    {
      "type": "single | window | recurring",
      "title": "Event-Name",
      "location": "Ort oder ''",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "end_date": "YYYY-MM-DD",
      "recurrence_rule": "weekly:thursday",
      "tags": ["bucket-list"],
      "bucket_list_item_title": "exakter Titel aus Bucket List"
    }
  ],

  // FÜR "add_bucket_list":
  "reply": "warme Antwort",
  "bucket_list_item": {
    "title": "Aktivität",
    "description": "Beschreibung",
    "tags": ["romantic", "food"],
    "duration_days": null
  },

  // FÜR "none":
  "reply": "warme Antwort"
}

REGELN:
- "events" ist IMMER ein Array (auch bei einem Event)
- Bei expliziten Daten (z.B. "20.09, 18.10"): ein Event PRO Datum, NICHT recurring
- relative Daten ("diesen Samstag"): von heute (${today}) berechnen
- Für single: wenn kein end_time, +2h zu start_time
- Für recurring: recurrence_rule = "weekly:DAYNAME" (Englisch)
- Bucket-List Tags: romantic, adventure, food, culture, outdoor, sport
- PAST DATES sind erlaubt (Erinnerungen)
- BUCKET LIST MATCHING: Wenn Event zu Bucket List passt → tags: ["bucket-list"] + bucket_list_item_title
- KOMBINATIONEN: Wenn ein Event mit Freunden/Family bald ist, vorschlagen was man damit kombinieren kann
- Vorschläge maximal 3-4 Stück, nicht überfordern
- Options-Beschriftungen sollen konkret sein ("Heute 14-16 Uhr"), nicht nur "Ja/Nein"`
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const message = formData.get('message') as string | null
  const imageFile = formData.get('image') as File | null

  if (!message?.trim() && !imageFile) {
    return Response.json({ error: 'No message or image' }, { status: 400 })
  }

  // Parallel: weather, bucket list, upcoming events
  const [weatherResult, bucketListResult, eventsResult] = await Promise.allSettled([
    getViennaWeather(),
    supabase.from('bucket_list').select('title, description, tags, duration_days').eq('resolved', false).order('created_at', { ascending: false }),
    supabase.from('events').select('title, date, start_time, end_time, location, type').gte('date', new Date().toISOString().split('T')[0]).order('date', { ascending: true }).limit(20),
  ])

  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null
  const weatherContextStr = weather ? weatherSummary(weather) : 'Nicht verfügbar.'

  // Build bucket list context with pre-categorised items
  const bucketListData = bucketListResult.status === 'fulfilled' ? bucketListResult.value.data : []
  const today = new Date().toISOString().split('T')[0]
  const dayOfWeek = new Date().getDay()
  const bucketListSummary = bucketListData?.length
    ? bucketListData.map(i => {
        const cat = categorizeItem(i.title, i.tags)
        const { feasible, reasoning } = feasibilityReason(cat, weather, today, dayOfWeek)
        return `- ${i.title}${i.description ? ': ' + i.description : ''}${i.tags?.length ? ' [' + i.tags.join(', ') + ']' : ''} [${cat}] ${feasible ? '✅' : '⏳'} ${reasoning}`
      }).join('\n')
    : ''

  // Build upcoming events summary
  const eventsData = eventsResult.status === 'fulfilled' ? eventsResult.value.data : []
  const eventsSummary = (eventsData ?? []).length
    ? (eventsData ?? []).slice(0, 15).map(e => {
        const when = e.start_time ? `${fmtDate(e.date)} ${e.start_time}–${e.end_time || ''} Uhr` : fmtDate(e.date)
        const loc = e.location ? ` @ ${e.location}` : ''
        return `- ${e.title}${loc} (${when})`
      }).join('\n')
    : 'Keine kommenden Events.'

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
    text: message?.trim() || 'What event is shown in this image? Extract all details.',
  })

  let gptText = ''
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1536,
      messages: [
        { role: 'system', content: buildSystemPrompt(bucketListSummary, eventsSummary, weatherContextStr) },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
    })
    gptText = res.choices[0]?.message?.content ?? ''
  } catch {
    return Response.json({ reply: "Couldn't reach the AI. Try again?" })
  }

  // ── Types ──────────────────────────────────────────────────
  type AiEvent = {
    type: string
    title: string
    location: string
    date: string
    start_time: string
    end_time: string
    end_date: string
    recurrence_rule: string
    tags?: string[]
    bucket_list_item_title?: string
  }
  type AiBucketItem = {
    title: string
    description: string
    tags: string[]
    duration_days: number | null
  }
  type AiOption = {
    label: string
    event: Record<string, unknown>
  }
  type AiSuggestion = {
    title: string
    category: string
    feasible: boolean
    reasoning: string
    options: AiOption[]
  }
  type AiNarrowing = {
    question: string
    options: { label: string; category: string }[]
  }
  type AiResponse = {
    reply: string
    action: 'ask' | 'suggest' | 'create_event' | 'add_bucket_list' | 'none'
    narrowing?: AiNarrowing | null
    suggestions?: AiSuggestion[] | null
    events?: AiEvent[] | null
    event?: AiEvent | null
    bucket_list_item: AiBucketItem | null
  }

  let parsed: AiResponse
  try {
    parsed = JSON.parse(gptText)
  } catch {
    return Response.json({ reply: gptText })
  }

  // ── Handle "ask" — return narrowing question ──────────────
  if (parsed.action === 'ask' && parsed.narrowing) {
    return Response.json({
      reply: parsed.reply,
      action: 'ask',
      narrowing: parsed.narrowing,
    })
  }

  // ── Handle "suggest" — return suggestions ──────────────────
  if (parsed.action === 'suggest' && parsed.suggestions?.length) {
    return Response.json({
      reply: parsed.reply,
      action: 'suggest',
      suggestions: parsed.suggestions,
    })
  }

  // ── Handle "create_event" — existing logic ─────────────────
  const savedEvents: unknown[] = []
  let savedBucketItem = null

  const eventList = (parsed.events ?? (parsed.event ? [parsed.event] : []))
    .filter(e => e && e.title)

  if (parsed.action === 'create_event' && eventList.length) {
    for (const ev of eventList) {
      const type = ev.type ?? 'single'

      const insertData: Record<string, unknown> = {
        title: ev.title,
        location: ev.location || '',
        date: ev.date,
        start_time: ev.start_time || '00:00',
        end_time: ev.end_time || ev.start_time || '00:00',
        type,
        end_date: ev.end_date || null,
        recurrence_rule: ev.recurrence_rule || null,
        added_by: 'dimitri',
        category: 'personal',
        status: 'confirmed',
        rsvp_dimitri: 'going',
      }

      if (ev.tags?.includes('bucket-list')) {
        insertData.tags = ['bucket-list']
      }

      const { data, error } = await supabase
        .from('events')
        .insert(insertData)
        .select()
        .single()

      if (error) continue
      savedEvents.push(data)

      if (ev.bucket_list_item_title) {
        await supabase
          .from('bucket_list')
          .update({ resolved: true })
          .ilike('title', `%${ev.bucket_list_item_title.substring(0, 40)}%`)
      }

      // Write to Google Cal
      if (type === 'single' || type === 'window') {
        try {
          const calendar = await getCalendarClient()
          if (type === 'single') {
            const offset = getViennaOffset(ev.date)
            await calendar.events.insert({
              calendarId: 'primary',
              requestBody: {
                summary: ev.title,
                location: ev.location || '',
                start: { dateTime: `${ev.date}T${ev.start_time}:00${offset}` },
                end: { dateTime: `${ev.date}T${ev.end_time}:00${offset}` },
              },
            })
          } else {
            await calendar.events.insert({
              calendarId: 'primary',
              requestBody: {
                summary: ev.title,
                location: ev.location || '',
                start: { date: ev.date },
                end: { date: addOneDay(ev.end_date) },
              },
            })
          }
        } catch {
          // Google Cal write silently fails
        }
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
        added_by: 'dimitri',
      })
      .select()
      .single()

    if (!error) savedBucketItem = data
  }

  return Response.json({
    reply: parsed.reply,
    action: parsed.action,
    events: savedEvents,
    event: savedEvents[0] ?? null,
    bucket_list_item: savedBucketItem,
  })
}
