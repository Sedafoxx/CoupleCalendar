'use client'
import { useState, useEffect } from 'react'
import type { Event, EventMedia } from '@/lib/supabase'
import EventMemoryCard from './EventMemoryCard'
import RsvpButtons from './RsvpButtons'
import { anyoneGoing } from '@/lib/event-utils'

interface FeedCardsProps {
  pastEvents: Event[]
  /** All media items with event_title/event_date (from GET /api/event-media?recent=true) */
  media: EventMedia[]
  onSelectEvent: (ev: Event) => void
  onDeleteMedia: (item: EventMedia) => void
  onAddMedia?: (ev: Event) => void
  onUpdated?: () => void
  showRsvp?: boolean
}

export default function FeedCards({
  pastEvents,
  media,
  onSelectEvent,
  onDeleteMedia,
  onAddMedia,
  onUpdated,
  showRsvp = true,
}: FeedCardsProps) {
  const [who, setWho] = useState<'dimitri' | 'theresa' | null>(null)

  useEffect(() => {
    fetch('/api/whoami').then(r => r.json()).then(d => setWho(d.user))
  }, [])

  const today = new Date().toISOString().split('T')[0]

  // Only events where at least one of us actually went show as memories.
  const past = pastEvents
    .filter(ev => ev.date < today && ev.category !== 'city' && anyoneGoing(ev))
    .sort((a, b) => b.date.localeCompare(a.date))

  // Group media by event
  const mediaByEvent = new Map<string, EventMedia[]>()
  for (const m of media) {
    const list = mediaByEvent.get(m.event_id) || []
    list.push(m)
    mediaByEvent.set(m.event_id, list)
  }

  if (past.length === 0) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-6xl">📸</p>
        <h2 className="text-xl font-semibold text-stone-700">Noch keine Erinnerungen</h2>
        <p className="text-stone-400 text-sm max-w-xs mx-auto">
          Erinnerungen erscheinen hier, sobald ihr vergangene Events gemeinsam bestätigt habt.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {past.map(ev => {
        const eventMedia = (mediaByEvent.get(ev.id) || [])
          .slice()
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
        return (
          <div key={ev.id} className="space-y-2">
            <EventMemoryCard
              event={ev}
              media={eventMedia}
              onEditEvent={onSelectEvent}
              onDeleteItem={onDeleteMedia}
              onAddMedia={onAddMedia}
            />
            {showRsvp && (
              <div className="px-1">
                <RsvpButtons event={ev} who={who} onUpdated={onUpdated} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
