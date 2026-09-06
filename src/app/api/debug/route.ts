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

  const [eventsRes, mediaRes] = await Promise.all([
    supabase.from('events').select('id,title,date,category').order('date', { ascending: false }).limit(100),
    supabase.from('event_media').select('id,event_id,kind,url,added_by'),
  ])

  const events = eventsRes.data || []
  const media = mediaRes.data || []

  const today = new Date().toISOString().split('T')[0]
  const pastPersonal = events.filter(e => e.date < today && e.category !== 'city')
  const photoItems = media.filter(m => m.kind === 'photo' || m.kind === 'video' || m.kind === 'youtube')
  const noteItems = media.filter(m => m.kind === 'note')
  const itemsByEvent = new Map<string, typeof media>()
  for (const m of media) {
    const list = itemsByEvent.get(m.event_id) || []
    list.push(m)
    itemsByEvent.set(m.event_id, list)
  }

  return Response.json({
    stats: {
      total_events: events.length,
      past_personal_events: pastPersonal.length,
      total_media: media.length,
      photo_video_items: photoItems.length,
      note_items: noteItems.length,
      events_with_media: [...new Set(photoItems.map(m => m.event_id))].length,
    },
    recent_events: events.slice(0, 10).map(e => ({
      date: e.date,
      title: e.title?.substring(0, 50),
      media_count: (itemsByEvent.get(e.id) || []).length,
      has_photo: photoItems.some(m => m.event_id === e.id),
      has_note: noteItems.some(m => m.event_id === e.id),
    })),
    recent_media: media.slice(0, 10).map(m => ({
      event_id: m.event_id,
      kind: m.kind,
      url: (m.url ?? '').substring(0, 60),
    })),
  })
}
