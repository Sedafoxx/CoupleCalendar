'use client'
import { useState } from 'react'
import type { Event } from '@/lib/supabase'
import { bothGoing } from '@/lib/event-utils'

// Shared RSVP controls used by the Plan page, calendar day view, memories feed
// and the Discover feed. Either partner may toggle EITHER person's RSVP
// (symmetric — Dimi can confirm for Theresa and vice versa). Both confirming
// "going" triggers the server-side memory + Google Calendar sync in
// /api/events/[id].
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
  const both = bothGoing(event)

  // Toggle one person's RSVP to/from 'going'. Either authenticated partner can
  // set either field (the API allows symmetric RSVP).
  async function toggle(name: 'dimitri' | 'theresa') {
    if (!who) return
    setUpdating(true)
    const field = name === 'dimitri' ? 'rsvp_dimitri' : 'rsvp_theresa'
    const currentlyGoing = name === 'dimitri' ? dimiGoing : theresaGoing
    try {
      await fetch(`/api/events/${event.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: currentlyGoing ? 'maybe' : 'going' }),
      })
      onUpdated?.()
    } finally {
      setUpdating(false)
    }
  }

  if (both) {
    return (
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className="text-xs bg-rose-500 text-white px-3 py-1 rounded-full font-medium">💕 Beide zu</span>
        {who && (
          <button
            onClick={() => toggle('dimitri')}
            disabled={updating}
            className="text-xs text-stone-400 hover:text-stone-600 transition"
          >
            {updating ? '...' : 'Dimi · Vielleicht'}
          </button>
        )}
        {who && (
          <button
            onClick={() => toggle('theresa')}
            disabled={updating}
            className="text-xs text-stone-400 hover:text-stone-600 transition"
          >
            {updating ? '...' : 'Theresa · Vielleicht'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 mt-2 flex-wrap">
      <button
        onClick={() => toggle('dimitri')}
        disabled={updating || !who}
        className={`text-xs px-2.5 py-1 rounded-full transition ${
          dimiGoing ? 'bg-stone-900 text-white' : who ? 'bg-stone-100 text-stone-500 hover:bg-stone-200' : 'bg-stone-100 text-stone-400'
        }`}
      >
        Dimi {dimiGoing ? '✅' : who ? '👆' : '👤'}
      </button>
      <button
        onClick={() => toggle('theresa')}
        disabled={updating || !who}
        className={`text-xs px-2.5 py-1 rounded-full transition ${
          theresaGoing ? 'bg-rose-400 text-white' : who ? 'bg-rose-50 text-rose-500 hover:bg-rose-100' : 'bg-rose-50 text-rose-300'
        }`}
      >
        Theresa {theresaGoing ? '✅' : who ? '👆' : '👤'}
      </button>
    </div>
  )
}
