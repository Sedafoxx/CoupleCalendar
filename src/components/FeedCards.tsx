
'use client'
import { useState, useEffect, useCallback } from 'react'
import type { Memory, Event } from '@/lib/supabase'
import MemoryCard from './MemoryCard'

interface FeedCardsProps {
  pastEvents: Event[]
  memories: (Memory & { event_title?: string; event_date?: string })[]
  onSelectEvent: (ev: Event) => void
  onSelectMemory: (mem: Memory) => void
}

type RsvpValue = 'going' | 'interested' | 'maybe' | null

export default function FeedCards({ pastEvents, memories, onSelectEvent, onSelectMemory }: FeedCardsProps) {
  const [who, setWho] = useState<'dimitri' | 'theresa' | null>(null)
  const [rsvpUpdating, setRsvpUpdating] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/whoami').then(r => r.json()).then(d => setWho(d.user))
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const past = pastEvents.filter(ev => ev.date < today && ev.category !== 'city')
  const memsByEvent = new Map<string, Memory[]>()
  for (const m of memories) {
    const list = memsByEvent.get(m.event_id) || []
    list.push(m)
    memsByEvent.set(m.event_id, list)
  }

  const feed = [...past].sort((a, b) => b.date.localeCompare(a.date))

  const setRsvp = useCallback(async (eventId: string, value: RsvpValue) => {
    setRsvpUpdating(eventId)
    const field = who === 'dimitri' ? 'rsvp_dimitri' : 'rsvp_theresa'
    await fetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    setRsvpUpdating(null)
    // Refresh the page to reflect changes
    window.location.reload()
  }, [who])

  function RsvpButton({ ev }: { ev: Event }) {
    const dimiGoing = ev.rsvp_dimitri === 'going'
    const theresaGoing = ev.rsvp_theresa === 'going'
    const bothGoing = dimiGoing && theresaGoing
    const myRsvp = who === 'dimitri' ? ev.rsvp_dimitri : ev.rsvp_theresa
    const isUpdating = rsvpUpdating === ev.id

    if (bothGoing) {
      return (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs bg-rose-500 text-white px-3 py-1 rounded-full font-medium">💕 Beide zu</span>
          <button
            onClick={(e) => { e.stopPropagation(); setRsvp(ev.id, 'maybe') }}
            disabled={isUpdating}
            className="text-xs text-stone-400 hover:text-stone-600 transition"
          >
            Vielleicht
          </button>
        </div>
      )
    }

    return (
      <div className="flex items-center gap-2 mt-2">
        {/* Dimis Status */}
        <span className={`text-xs px-2.5 py-1 rounded-full ${dimiGoing ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-400'}`}>
          Dimi {dimiGoing ? '✅' : '👤'}
        </span>
        {/* Theresas Status */}
        <span className={`text-xs px-2.5 py-1 rounded-full ${theresaGoing ? 'bg-rose-400 text-white' : 'bg-rose-50 text-rose-300'}`}>
          Theresa {theresaGoing ? '✅' : '👤'}
        </span>
        {/* My RSVP button */}
        {who && (
          <button
            onClick={(e) => { e.stopPropagation(); setRsvp(ev.id, myRsvp === 'going' ? null : 'going') }}
            disabled={isUpdating}
            className={`text-xs px-3 py-1 rounded-full font-medium transition ${
              myRsvp === 'going'
                ? 'bg-rose-500 text-white'
                : 'bg-rose-100 text-rose-500 hover:bg-rose-200'
            }`}
          >
            {isUpdating ? '...' : myRsvp === 'going' ? '✅ Going' : '🙋 Will hin'}
          </button>
        )}
      </div>
    )
  }

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
              <div className="px-1">
                <RsvpButton ev={ev} />
              </div>
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
              <RsvpButton ev={ev} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
