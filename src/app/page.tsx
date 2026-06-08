'use client'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import type { Event } from '@/lib/supabase'

export default function Dashboard() {
  const { data: session, status } = useSession()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    title: '',
    location: '',
    date: '',
    start_time: '',
    end_time: '',
  })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') fetchEvents()
  }, [status])

  async function fetchEvents() {
    setLoading(true)
    const res = await fetch('/api/events')
    const data = await res.json()
    setEvents(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function addEvent(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setForm({ title: '', location: '', date: '', start_time: '', end_time: '' })
    await fetchEvents()
    setSubmitting(false)
  }

  async function deleteEvent(id: string) {
    await fetch(`/api/events/${id}`, { method: 'DELETE' })
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  if (status === 'loading') {
    return <div className="p-8 text-stone-400">Loading...</div>
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold">CoupleCalendar</h1>
          <p className="text-stone-500">Plan dates around your real schedule.</p>
          <button
            onClick={() => signIn('google')}
            className="bg-stone-900 text-white px-6 py-3 rounded-lg hover:bg-stone-700 transition"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">CoupleCalendar</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone-500">{session.user?.email}</span>
          <button
            onClick={() => signOut()}
            className="text-sm text-stone-500 hover:text-stone-900 transition"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Add Event</h2>
        <form onSubmit={addEvent} className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
          <input
            required
            placeholder="Event title (e.g. Vintage store opening)"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
          <input
            required
            placeholder="Location"
            value={form.location}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
          <input
            required
            type="date"
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-stone-500 block mb-1">Event opens</label>
              <input
                required
                type="time"
                value={form.start_time}
                onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-stone-500 block mb-1">Event closes</label>
              <input
                required
                type="time"
                value={form.end_time}
                onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-stone-900 text-white py-2 rounded-lg text-sm hover:bg-stone-700 transition disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add Event'}
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Your Events</h2>
          <a
            href="/plan"
            target="_blank"
            className="text-sm text-stone-500 hover:text-stone-900 underline"
          >
            Open partner view ↗
          </a>
        </div>

        {loading ? (
          <p className="text-stone-400 text-sm">Loading...</p>
        ) : events.length === 0 ? (
          <p className="text-stone-400 text-sm">No events yet.</p>
        ) : (
          <ul className="space-y-2">
            {events.map(ev => (
              <li
                key={ev.id}
                className="bg-white border border-stone-200 rounded-xl p-4 flex items-start justify-between gap-4"
              >
                <div>
                  <p className="font-medium">{ev.title}</p>
                  <p className="text-sm text-stone-500">{ev.location}</p>
                  <p className="text-xs text-stone-400 mt-1">
                    {ev.date} · {ev.start_time}–{ev.end_time}
                  </p>
                </div>
                <button
                  onClick={() => deleteEvent(ev.id)}
                  className="text-stone-300 hover:text-red-400 transition text-sm shrink-0"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
