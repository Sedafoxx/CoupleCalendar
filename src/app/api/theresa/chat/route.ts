import OpenAI from 'openai'
import { isTheresaAuthed } from '@/lib/theresa-auth'
import { supabase } from '@/lib/supabase'
import { getCalendarClient } from '@/lib/google-auth'
import { getFreeBusySlots } from '@/lib/freebusy'
import { NextRequest } from 'next/server'

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

function buildSystemPrompt(freeBusySummary: string, bucketListSummary: string): string {
  const today = new Date().toISOString().split('T')[0]
  return `Du bist ein liebevoller Kalenderassistent für Dimitri und Theresa. Heute ist ${today}.

Du hilfst Theresa dabei, gemeinsame Zeit mit Dimitri zu planen. Theresa kann Events direkt erstellen — keine Bestätigung nötig.

Dimitris freie Zeiten (Wien-Zeit):
${freeBusySummary}

Eure Bucket-List (Dinge die ihr noch tun wollt):
${bucketListSummary || 'Noch leer — füge etwas hinzu!'}

Du kannst vier Arten von Events erstellen:
1. **single** – bestimmtes Datum und Uhrzeit (Konzert, Abendessen, Kino). Braucht: title, date, start_time, end_time.
2. **window** – über mehrere Tage aktiv, keine feste Zeit (Zirkus, Festival, Ausstellung). Braucht: title, date (Start), end_date.
3. **recurring** – wiederkehrend (jeden Donnerstag, wöchentliches Kochen). Braucht: title, date (erste Occurrence), recurrence_rule Format "weekly:DAY".
4. **bucket_list** – noch kein Datum, irgendwann machen. Braucht: title, optionale description/tags/duration_days.

Antworte immer auf Deutsch in exakt diesem JSON-Format:
{
  "reply": "liebevolle, warme Antwort auf Deutsch",
  "action": "create_event | add_bucket_list | none",
  "event": {
    "type": "single | window | recurring",
    "title": "Name des Events",
    "location": "Ort oder leerer String",
    "date": "YYYY-MM-DD",
    "start_time": "HH:MM",
    "end_time": "HH:MM",
    "end_date": "YYYY-MM-DD",
    "recurrence_rule": "weekly:thursday"
  } | null,
  "bucket_list_item": {
    "title": "Aktivität",
    "description": "kurze Beschreibung",
    "tags": ["romantic", "adventure", "food", "culture", "outdoor", "sport"],
    "duration_days": null
  } | null
}

Regeln:
- Schau dir Dimitris freie Zeiten an und schlage passende Slots vor wenn sie fragt
- Relative Daten ("diesen Samstag", "nächste Woche"): berechne von heute (${today})
- Für single Events: wenn kein end_time, füge 2 Stunden zur start_time hinzu
- Für window Events: end_date Pflichtfeld, keine start_time/end_time
- recurrence_rule Format: "weekly:DAYNAME" auf Englisch (z.B. "weekly:thursday")
- Bucket-List Tags nur aus: romantic, adventure, food, culture, outdoor, sport
- location: leerer String wenn unbekannt
- Wenn gespeichert, freundlich bestätigen
- Bei action "none" nur chatten oder Fragen beantworten`
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

  // Fetch freebusy and bucket list for context
  const [freeBusyResult, bucketListResult] = await Promise.allSettled([
    getFreeBusySlots(),
    supabase.from('bucket_list').select('title, description, tags, duration_days').order('created_at', { ascending: false }),
  ])

  const freeSlots = freeBusyResult.status === 'fulfilled' ? freeBusyResult.value : []
  const bucketListData = bucketListResult.status === 'fulfilled' ? bucketListResult.value.data : []

  const freeBusySummary = fmtSlots(freeSlots)
  const bucketListSummary = bucketListData?.length
    ? bucketListData.map(i => `- ${i.title}${i.description ? ': ' + i.description : ''}${i.tags?.length ? ' [' + i.tags.join(', ') + ']' : ''}`).join('\n')
    : ''

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
      max_tokens: 1024,
      messages: [
        { role: 'system', content: buildSystemPrompt(freeBusySummary, bucketListSummary) },
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
  type AiResponse = {
    reply: string
    action: 'create_event' | 'add_bucket_list' | 'none'
    event: AiEvent | null
    bucket_list_item: AiBucketItem | null
  }

  let parsed: AiResponse
  try {
    parsed = JSON.parse(gptText)
  } catch {
    return Response.json({ reply: gptText })
  }

  let savedEvent = null
  let savedBucketItem = null

  if (parsed.action === 'create_event' && parsed.event?.title) {
    const ev = parsed.event
    const type = ev.type ?? 'single'

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
          // Google Cal write failed silently
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
        added_by: 'theresa',
      })
      .select()
      .single()

    if (!error) savedBucketItem = data
  }

  return Response.json({ reply: parsed.reply, event: savedEvent, bucket_list_item: savedBucketItem })
}
