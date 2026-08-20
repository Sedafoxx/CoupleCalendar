'use client'
import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import type { Event, Memory } from '@/lib/supabase'
import Calendar from '@/components/Calendar'
import EventDetail from '@/components/EventDetail'
import DiscoverFeed from '@/components/DiscoverFeed'
import ProvenanceBadge from '@/components/ProvenanceBadge'
import RsvpButtons from '@/components/RsvpButtons'
import { compareByProvenanceThenDate, anyoneGoing } from '@/lib/event-utils'

export default function CalendarPage() {
  const { data: session, status } = useSession()
  const [events, setEvents] = useState<Event[]>([])
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [who, setWho] = useState<'dimitri' | 'theresa' | null>(null)
  const [mode, setMode] = useState<'plans' | 'discover'>('plans')
  const [showPinInput, setShowPinInput] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState(false)

  async function loginTheresa(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/theresa-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pinValue }),
    })
    if (res.ok) { setShowPinInput(false); setPinValue(''); window.location.reload() }
    else { setPinError(true); setPinValue('') }
  }

  async function refreshEvents() {
    const res = await fetch('/api/events?past=true')
    const data = await res.json()
    setEvents(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    fetch('/api/whoami').then(r => r.json()).then(d => setWho(d.user))
    if (status === 'authenticated' || who) {
      Promise.all([
        fetch('/api/events?past=true').then((r) => r.json()),
        fetch('/api/memories?recent=true&limit=100').then((r) => r.json()),
      ]).then(([eventsData, memoriesData]) => {
        setEvents(Array.isArray(eventsData) ? eventsData : [])
        setMemories(Array.isArray(memoriesData) ? memoriesData : [])
        setLoading(false)
      }).catch(() => setLoading(false))
    }
  }, [status, who])

  if (status === 'loading') return <div className="p-8 text-stone-400">Loading...</div>

  if (!session && !who) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-4xl">♡</p>
          <h1 className="text-3xl font-bold">Dimi Time</h1>
          <button onClick={() => signIn('google')} className="bg-stone-900 text-white px-6 py-3 rounded-lg hover:bg-stone-700 transition">Dimi ♡</button>
          <button onClick={() => setShowPinInput(true)} className="text-rose-400 hover:text-rose-600 underline text-sm block mx-auto">Theresa 🔐</button>
        </div>
        {showPinInput && (
          <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-8 w-full max-w-xs shadow-xl space-y-4 text-center">
              <p className="text-4xl">💌</p>
              <h2 className="font-bold text-lg">Hey Theresa!</h2>
              <form onSubmit={loginTheresa} className="space-y-3">
                <input type="password" value={pinValue} onChange={e => { setPinValue(e.target.value); setPinError(false) }} placeholder="PIN" className="w-full border border-rose-100 rounded-xl px-4 py-3 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-rose-300 bg-rose-50/50" autoFocus />
                {pinError && <p className="text-red-400 text-sm">Falscher PIN 💕</p>}
                <button type="submit" disabled={!pinValue} className="w-full bg-gradient-to-r from-rose-400 to-pink-500 text-white py-3 rounded-xl font-medium disabled:opacity-50">Rein ♡</button>
                <button type="button" onClick={() => setShowPinInput(false)} className="text-sm text-stone-400">Vielleicht später</button>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Plans mode shows only the couple's own events; scraped suggestions live in Discover.
  // Manually-added plans sort first, then by date. Upcoming unconfirmed events stay
  // visible here (they live in the calendar), but unconfirmed PAST events are treated
  // as never-happened and don't show up.
  const today = new Date().toISOString().split('T')[0]
  const plansEvents = events
    .filter((e) => e.category !== 'city' && (e.date >= today || anyoneGoing(e)))
    .sort(compareByProvenanceThenDate)
  const dayEvents = selectedDate
    ? plansEvents.filter((e) => e.date === selectedDate)
    : []

  return (
    <div className="max-w-2xl mx-auto p-6 pb-24 space-y-6">
      <header className="pt-2">
        <h1 className="text-2xl font-bold">📅 Calendar</h1>
        <p className="text-sm text-stone-400 mt-0.5">Our plans, memories & upcoming events</p>
      </header>

      {/* Plans | Discover toggle */}
      <div className="flex bg-stone-100 rounded-xl p-1">
        <button
          onClick={() => setMode('plans')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
            mode === 'plans' ? 'bg-white text-stone-800 shadow-sm' : 'text-stone-400 hover:text-stone-600'
          }`}
        >
          📅 Plans
        </button>
        <button
          onClick={() => setMode('discover')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
            mode === 'discover' ? 'bg-white text-rose-600 shadow-sm' : 'text-stone-400 hover:text-stone-600'
          }`}
        >
          ✨ Discover
        </button>
      </div>

      {mode === 'plans' ? (
        <>
          <Calendar
            events={plansEvents}
            memories={memories}
            loading={loading}
            onSelectDate={(dateStr) => setSelectedDate(dateStr)}
            onSelectEvent={(ev) => setSelectedEvent(ev)}
          />

          {/* Events for selected date */}
          {selectedDate && dayEvents.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-semibold text-stone-700 text-sm">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('de-AT', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
              </h3>
              <ul className="space-y-2">
                {dayEvents.map((ev) => (
                  <li key={ev.id} className="bg-white border border-stone-200 rounded-xl p-4 hover:border-rose-200 hover:shadow-sm transition">
                    <button
                      onClick={() => setSelectedEvent(ev)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-stone-800">{ev.title}</p>
                        <ProvenanceBadge event={ev} />
                      </div>
                      {ev.location && (
                        <p className="text-sm text-stone-500 truncate">{ev.location}</p>
                      )}
                      {ev.start_time && (
                        <p className="text-xs text-stone-400 mt-0.5">
                          {ev.start_time.slice(0, 5)}{ev.end_time ? ` – ${ev.end_time.slice(0, 5)}` : ''}
                        </p>
                      )}
                    </button>
                    {/* Confirm "we are going" right from the day view */}
                    <RsvpButtons event={ev} who={who} onUpdated={refreshEvents} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {selectedDate && dayEvents.length === 0 && (
            <p className="text-stone-400 text-sm text-center py-4">
              No plans on this day ♡
            </p>
          )}

          {/* Clear date selection */}
          {selectedDate && (
            <button
              onClick={() => setSelectedDate(null)}
              className="text-sm text-stone-400 hover:text-stone-600 transition underline w-full text-center"
            >
              Clear selection
            </button>
          )}
        </>
      ) : (
        <DiscoverFeed
          events={events}
          who={who}
          onSelectEvent={(ev) => setSelectedEvent(ev)}
          onUpdated={() => refreshEvents()}
        />
      )}

      {/* Event detail modal */}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  )
}
