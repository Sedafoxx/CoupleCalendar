import OpenAI from 'openai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { getCalendarClient } from '@/lib/google-auth'
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

function buildSystemPrompt(bucketListSummary: string): string {
  const today = new Date().toISOString().split('T')[0]
  return `You are a smart calendar assistant for Dimitri and Theresa's shared couple calendar. Today is ${today}.

You can handle four types of events:
1. **single** – specific date and time (concert, dinner, cinema). Needs: title, date, start_time, end_time.
2. **window** – active over a date range, no fixed time (circus in town, festival week, exhibition). Needs: title, date (start), end_date.
3. **recurring** – repeats on a schedule (every Thursday dinner, weekly yoga). Needs: title, date (first occurrence), recurrence_rule format "weekly:DAY" (e.g. "weekly:thursday").
4. **bucket_list** – no date yet, things to do someday. Needs: title, optional description/tags/duration_days.

Current bucket list:
${bucketListSummary || 'Empty — nothing added yet.'}

Always respond with valid JSON in exactly this format:
{
  "reply": "warm, friendly reply",
  "action": "create_event | add_bucket_list | none",
  "events": [
    {
      "type": "single | window | recurring",
      "title": "event name",
      "location": "venue or address, empty string if unknown",
      "date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "end_date": "YYYY-MM-DD",
      "recurrence_rule": "weekly:thursday"
    }
  ],
  "bucket_list_item": {
    "title": "activity name",
    "description": "short description",
    "tags": ["romantic", "adventure", "food", "culture", "outdoor", "sport"],
    "duration_days": null
  } | null
}

Rules:
- "events" is ALWAYS an array. One event → array of one. Multiple → one object each.
- CRITICAL: when the text lists several explicit dates (e.g. "20.09, 18.10, 15.11, 20.12"), create ONE separate single event PER date. Same title/time/location, different date. NEVER collapse explicit dates into a recurring event.
- Only use type "recurring" when the user describes an open-ended repeating pattern with NO explicit end list (e.g. "every Thursday", "wöchentlich"). A finite list of dates is NOT recurring.
- If the user says "all 4 dates" / "mach alle Termine" referring to dates mentioned earlier in the conversation, reproduce every one of those dates as its own single event.
- For images: read ALL visible text and extract every detail
- Relative dates ("this Saturday", "next Friday", "tomorrow"): calculate from today (${today})
- For single events: if end_time not stated, add 2 hours to start_time
- For window events: end_date required, omit start_time/end_time
- For recurring: recurrence_rule format is "weekly:DAYNAME" (e.g. "weekly:monday", "weekly:thursday")
- Bucket list tags pick from: romantic, adventure, food, culture, outdoor, sport
- location: empty string if unknown
- When event/item saved, confirm clearly in reply
- PAST DATES are allowed — if the user wants to add a past event (e.g. "vintage shopping on 20.07."), create it normally. Past events are used as "things we did" / memories.
- Set action to "none" if user is just chatting or asking questions`
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

  // Fetch bucket list for context
  const { data: bucketListData } = await supabase
    .from('bucket_list')
    .select('title, description, tags, duration_days')
    .order('created_at', { ascending: false })

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
    text: message?.trim() || 'What event is shown in this image? Extract all details.',
  })

  let gptText = ''
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: buildSystemPrompt(bucketListSummary) },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
    })
    gptText = res.choices[0]?.message?.content ?? ''
  } catch {
    return Response.json({ reply: "Couldn't reach the AI. Try again?" })
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
    events?: AiEvent[] | null
    event?: AiEvent | null   // legacy single-event shape, still tolerated
    bucket_list_item: AiBucketItem | null
  }

  let parsed: AiResponse
  try {
    parsed = JSON.parse(gptText)
  } catch {
    return Response.json({ reply: gptText })
  }

  const savedEvents: unknown[] = []
  let savedBucketItem = null

  // Normalize to an array (model may still emit a single "event").
  const eventList = (parsed.events ?? (parsed.event ? [parsed.event] : []))
    .filter(e => e && e.title)

  if (parsed.action === 'create_event' && eventList.length) {
    for (const ev of eventList) {
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
          added_by: 'dimitri',
          category: 'personal',
          status: 'confirmed',
          rsvp_dimitri: 'going',
        })
        .select()
        .single()

      if (error) continue
      savedEvents.push(data)

      // Write to Google Cal for single and window events
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
          // Google Cal write failed silently — event still saved in Supabase
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
    events: savedEvents,
    event: savedEvents[0] ?? null, // legacy field for older clients
    bucket_list_item: savedBucketItem,
  })
}
