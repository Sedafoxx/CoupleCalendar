'use client'
import { useState, useEffect } from 'react'
import type { Event } from '@/lib/supabase'

type FreeSlot = { start: string; end: string }
type EventWithSlots = { event: Event; freeSlots: FreeSlot[] }

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export default function PlanPage() {
  const [data, setData] = useState<EventWithSlots[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState<{
    event: Event
    slot: FreeSlot
    start: string
    end: string
  } | null>(null)
  const [booked, setBooked] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch('/api/freebusy')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(Array.isArray(d) ? d : [])
      })
      .catch(() => setError('Failed to load. Try again.'))
      .finally(() => setLoading(false))
  }, [])

  function openBooking(event: Event, slot: FreeSlot) {
    setBooking({ event, slot, start: slot.start, end: slot.end })
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault()
    if (!booking) return
    setSubmitting(true)

    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: booking.event.title,
        location: booking.event.location,
        startTime: booking.start,
        endTime: booking.end,
      }),
    })

    if (res.ok) {
      setBooked(true)
      setBooking(null)
    } else {
      const d = await res.json()
      setError(d.error ?? 'Booking failed.')
    }
    setSubmitting(false)
  }

  if (booked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-4xl">🗓</div>
          <h2 className="text-xl font-semibold">Booked!</h2>
          <p className="text-stone-500">It&apos;s on the calendar.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Pick a date</h1>
        <p className="text-stone-500 text-sm">These are events with time where Dimitri is free.</p>
      </header>

      {loading && <p className="text-stone-400 text-sm">Checking calendar...</p>}
      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && !error && data.length === 0 && (
        <p className="text-stone-400 text-sm">No available slots right now. Check back soon.</p>
      )}

      <ul className="space-y-4">
        {data.map(({ event, freeSlots }) => (
          <li key={event.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-stone-100">
              <p className="font-semibold">{event.title}</p>
              <p className="text-sm text-stone-500">{event.location}</p>
              <p className="text-xs text-stone-400 mt-1">{fmtDate(event.date)}</p>
            </div>
            <div className="p-3 space-y-2">
              <p className="text-xs text-stone-400 uppercase tracking-wide px-1">Available windows</p>
              {freeSlots.map((slot, i) => (
                <button
                  key={i}
                  onClick={() => openBooking(event, slot)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-stone-50 hover:bg-stone-100 transition text-sm flex justify-between items-center"
                >
                  <span>{fmt(slot.start)} – {fmt(slot.end)}</span>
                  <span className="text-stone-400 text-xs">Book →</span>
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {booking && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-lg">{booking.event.title}</h3>
              <p className="text-sm text-stone-500">{booking.event.location} · {fmtDate(booking.event.date)}</p>
            </div>

            <form onSubmit={submitBooking} className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-stone-500 block mb-1">Start time</label>
                  <input
                    type="time"
                    required
                    value={new Date(booking.start).toTimeString().slice(0, 5)}
                    min={new Date(booking.slot.start).toTimeString().slice(0, 5)}
                    max={new Date(booking.slot.end).toTimeString().slice(0, 5)}
                    onChange={e => {
                      const [h, m] = e.target.value.split(':')
                      const d = new Date(booking.slot.start)
                      d.setHours(Number(h), Number(m), 0, 0)
                      setBooking(b => b ? { ...b, start: d.toISOString() } : b)
                    }}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-stone-500 block mb-1">End time</label>
                  <input
                    type="time"
                    required
                    value={new Date(booking.end).toTimeString().slice(0, 5)}
                    min={new Date(booking.slot.start).toTimeString().slice(0, 5)}
                    max={new Date(booking.slot.end).toTimeString().slice(0, 5)}
                    onChange={e => {
                      const [h, m] = e.target.value.split(':')
                      const d = new Date(booking.slot.end)
                      d.setHours(Number(h), Number(m), 0, 0)
                      setBooking(b => b ? { ...b, end: d.toISOString() } : b)
                    }}
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setBooking(null)}
                  className="flex-1 border border-stone-200 py-2 rounded-lg text-sm hover:bg-stone-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-stone-900 text-white py-2 rounded-lg text-sm hover:bg-stone-700 transition disabled:opacity-50"
                >
                  {submitting ? 'Booking...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
