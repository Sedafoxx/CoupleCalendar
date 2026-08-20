
'use client'
import { useState, useEffect } from 'react'
import type { Memory, Event } from '@/lib/supabase'
import MemoryCard from './MemoryCard'
import RsvpButtons from './RsvpButtons'
import { anyoneGoing } from '@/lib/event-utils'

interface FeedCardsProps {
  pastEvents: Event[]
  memories: (Memory & { event_title?: string; event_date?: string })[]
  onSelectEvent: (ev: Event) => void
  onSelectMemory: (mem: Memory) => void
  showRsvp?: boolean
}

export default function FeedCards({ pastEvents, memories, onSelectEvent, onSelectMemory, showRsvp = true }: FeedCardsProps) {
  const [who, setWho] = useState<'dimitri' | 'theresa' | null>(null)

  useEffect(() => {
    fetch('/api/whoami').then(r => r.json()).then(d => setWho(d.user))
  }, [])

  const today = new Date().toISOString().split('T')[0]
  // Only events where at least one of us actually went show as memories —
  // unconfirmed past events are treated as never-happened.
  const past = pastEvents.filter(ev => ev.date < today && ev.category !== 'city' && anyoneGoing(ev))
  const memsByEvent = new Map<string, Memory[]>()
  for (const m of memories) {
    const list = memsByEvent.get(m.event_id) || []
    list.push(m)
    memsByEvent.set(m.event_id, list)
  }

  const feed = [...past].sort((a, b) => b.date.localeCompare(a.date))

  if (feed.length === 0) {
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-6xl">📸</p>
        <h2 className="text-xl font-semibold text-stone-700">No memories yet</h2>
        <p className="text-stone-400 text-sm max-w-xs mx-auto">
          Capture your first moment together!
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {feed.map(ev => {
        const eventMems = memsByEvent.get(ev.id) || []
        const photoMem = eventMems.find(m => !m.photo_back.includes('note.gif'))
        const hasNote = eventMems.some(m => m.photo_back.includes('note.gif'))

        if (photoMem) {
          return (
            <div key={ev.id} className="space-y-2">
              <MemoryCard
                memory={{ ...photoMem, event_title: ev.title, event_date: ev.date }}
                onClick={() => onSelectMemory(photoMem)}
              />
              {showRsvp && (
                <div className="px-1">
                  <RsvpButtons event={ev} who={who} onUpdated={() => window.location.reload()} />
                </div>
              )}
            </div>
          )
        }

        return (
          <div
            key={ev.id}
            onClick={() => onSelectEvent(ev)}
            className="w-full text-left bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-rose-200 transition group cursor-pointer"
          >
            <div className="h-28 bg-gradient-to-br from-rose-100 via-pink-50 to-stone-100 flex items-center justify-center">
              <div className="text-center">
                <span className="text-4xl">♡</span>
                <p className="text-rose-300 text-xs mt-1 font-medium">{hasNote ? '📝 Notiz' : 'Memory'}</p>
              </div>
            </div>
            <div className="px-4 py-3 space-y-2">
              <span className="font-semibold text-sm text-stone-800 truncate block">{ev.title}</span>
              <p className="text-xs text-stone-400">
                {new Date(ev.date + 'T00:00:00').toLocaleDateString('de-AT', {
                  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                })}
                {ev.start_time && ` · ${ev.start_time}–${ev.end_time}`}
              </p>
              {showRsvp && (
                <RsvpButtons event={ev} who={who} onUpdated={() => window.location.reload()} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
