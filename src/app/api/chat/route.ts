import OpenAI from 'openai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest } from 'next/server'

const openai = new OpenAI()

const SYSTEM_PROMPT = `You are a calendar assistant for a couple's shared calendar. Today's date is ${new Date().toISOString().split('T')[0]}.

Users send you text messages or screenshots (Instagram posts, event flyers, photos of posters, etc.) about events they want to attend together.

Always respond with valid JSON in exactly this format:
{
  "reply": "your warm, friendly reply",
  "event": {
    "title": "event name",
    "location": "venue or address, empty string if unknown",
    "date": "YYYY-MM-DD",
    "start_time": "HH:MM",
    "end_time": "HH:MM"
  }
}

Or if you cannot extract enough info (need at minimum: title, date, start_time):
{
  "reply": "friendly message asking what's missing",
  "event": null
}

Rules:
- For images: read ALL visible text and extract every detail
- For relative dates ("this Saturday", "next Friday", "tomorrow"): calculate from today
- end_time: if not stated, add 2 hours to start_time
- location: empty string if unknown
- When event is saved, confirm in your reply what you added`

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const message = formData.get('message') as string | null
  const imageFile = formData.get('image') as File | null

  if (!message?.trim() && !imageFile) {
    return Response.json({ error: 'No message or image' }, { status: 400 })
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
    text: message?.trim() || 'What event is shown in this image? Extract all details.',
  })

  let gptText = ''
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
    })
    gptText = res.choices[0]?.message?.content ?? ''
  } catch {
    return Response.json({ reply: "Couldn't reach the AI. Try again?" })
  }

  let parsed: {
    reply: string
    event: {
      title: string
      location: string
      date: string
      start_time: string
      end_time: string
    } | null
  }

  try {
    parsed = JSON.parse(gptText)
  } catch {
    return Response.json({ reply: gptText })
  }

  let savedEvent = null
  if (parsed.event?.title && parsed.event?.date && parsed.event?.start_time) {
    const { data, error } = await supabase
      .from('events')
      .insert({
        title: parsed.event.title,
        location: parsed.event.location || '',
        date: parsed.event.date,
        start_time: parsed.event.start_time,
        end_time: parsed.event.end_time || parsed.event.start_time,
      })
      .select()
      .single()

    if (!error) savedEvent = data
  }

  return Response.json({ reply: parsed.reply, event: savedEvent })
}
