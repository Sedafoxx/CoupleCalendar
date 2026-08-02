'use client'
import { useState } from 'react'
import type { Event } from '@/lib/supabase'

// Shared RSVP controls used by the Plan page, memories feed and the Discover
// feed. Both partners confirming ("going") triggers the server-side memory +
// Google Calendar sync in /api/events/[id].
type Who = 'dimitri' | 'theresa' | null

interface RsvpButtonsProps {
  event: Event
  who: Who
  onUpdated?: () => void
}

export default function RsvpButtons({ event, who, onUpdated }: RsvpButtonsProps) {
  const [updating, setUpdating] = useState(false)

  const dimiGoing = event.rsvp_dimitri === 'going'
  const theresaGoing = event.rsvp_theresa === 'going'
  const bothGoing = dimiGoing && theresaGoing
  const myRsvp = who === 'dimitri' ? event.rsvp_dimitri : who === 'theresa' ? event.rsvp_theresa : null

  async function setRsvp(value: 'going' | 'maybe' | null) {
    if (!who) return
    setUpdating(true)
    const field = who === 'dimitri' ? 'rsvp_dimitri' : 'rsvp_theresa'
    try {
      await fetch(`/api/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      onUpdated?.()
    } finally {
      setUpdating(false)
    }
  }

  if (bothGoing) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <span className="text-xs bg-rose-500 text-white px-3 py-1 rounded-full font-medium">💕 Beide zu</span>
        {who && (
          <button
            onClick={() => setRsvp('maybe')}
            disabled={updating}
            className="text-xs text-stone-400 hover:text-stone-600 transition"
          >
            {updating ? '...' : 'Vielleicht'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 mt-2 flex-wrap">
      <span className={`text-xs px-2.5 py-1 rounded-full ${dimiGoing ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-400'}`}>
        Dimi {dimiGoing ? '✅' : '👤'}
      </span>
      <span className={`text-xs px-2.5 py-1 rounded-full ${theresaGoing ? 'bg-rose-400 text-white' : 'bg-rose-50 text-rose-300'}`}>
        Theresa {theresaGoing ? '✅' : '👤'}
      </span>
      {who && (
        <button
          onClick={() => setRsvp(myRsvp === 'going' ? null : 'going')}
          disabled={updating}
          className={`text-xs px-3 py-1 rounded-full font-medium transition ${
            myRsvp === 'going' ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-500 hover:bg-rose-200'
          }`}
        >
          {updating ? '...' : myRsvp === 'going' ? '✅ Going' : '🙋 Will hin'}
        </button>
      )}
    </div>
  )
}
