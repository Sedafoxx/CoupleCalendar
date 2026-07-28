import { supabase } from '@/lib/supabase'
import { NextRequest } from 'next/server'

/**
 * Debug endpoint — returns app state for debugging.
 * GET /api/debug
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== 'Bearer zoo-debug-key') {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const [eventsRes, memsRes] = await Promise.all([
    supabase.from('events').select('id,title,date,category').order('date', { ascending: false }).limit(100),
    supabase.from('memories').select('id,event_id,caption,photo_back'),
  ])

  const events = eventsRes.data || []
  const mems = memsRes.data || []

  const today = new Date().toISOString().split('T')[0]
  const pastPersonal = events.filter(e => e.date < today && e.category !== 'city')
  const photoMems = mems.filter(m => !m.photo_back?.includes('note.gif'))
  const memsByEvent = new Map<string, typeof mems>()
  for (const m of mems) {
    const list = memsByEvent.get(m.event_id) || []
    list.push(m)
    memsByEvent.set(m.event_id, list)
  }

  return Response.json({
    stats: {
      total_events: events.length,
      past_personal_events: pastPersonal.length,
      total_memories: mems.length,
      photo_memories: photoMems.length,
      events_with_photos: [...new Set(photoMems.map(m => m.event_id))].length,
    },
    recent_events: events.slice(0, 10).map(e => ({
      date: e.date,
      title: e.title?.substring(0, 50),
      has_photo: photoMems.some(m => m.event_id === e.id),
      has_note: mems.some(m => m.event_id === e.id && m.photo_back?.includes('note.gif')),
    })),
    recent_memories: mems.slice(0, 10).map(m => ({
      event_id: m.event_id,
      is_note: m.photo_back?.includes('note.gif') || false,
      caption: m.caption?.substring(0, 40),
    })),
  })
}
