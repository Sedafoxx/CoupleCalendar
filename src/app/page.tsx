'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import type { Event, Notification } from '@/lib/supabase'
import EventDetail from '@/components/EventDetail'

export default function PlanPage() {
  const { data: session, status } = useSession()
  const [events, setEvents] = useState<Event[]>([])
  const [who, setWho] = useState<'dimitri' | 'theresa' | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [rsvpUpdating, setRsvpUpdating] = useState<string | null>(null)

  // Chat
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotif, setShowNotif] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const seenNotifIds = useRef<Set<string>>(new Set())
  const notifPrimed = useRef(false)
  const unreadCount = notifications.filter(n => !n.read).length

  useEffect(() => {
    fetch('/api/whoami').then(r => r.json()).then(d => setWho(d.user))
    if (status === 'authenticated') {
      fetchEvents()
      fetchNotifications()
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
      const id = setInterval(fetchNotifications, 20000)
      return () => clearInterval(id)
    }
  }, [status])

  async function fetchEvents() {
    const res = await fetch('/api/events')
    const data = await res.json()
    setEvents(Array.isArray(data) ? data : [])
  }

  async function fetchNotifications() {
    const res = await fetch('/api/notifications')
    if (!res.ok) return
    const data: Notification[] = await res.json()
    if (!Array.isArray(data)) return
    const fresh = data.filter(n => !seenNotifIds.current.has(n.id))
    data.forEach(n => seenNotifIds.current.add(n.id))
    if (notifPrimed.current) {
      const newUnread = fresh.filter(n => !n.read)
      if (newUnread.length) {
        setToast(newUnread[0].message)
        setTimeout(() => setToast(null), 6000)
      }
    }
    notifPrimed.current = true
    setNotifications(data)
  }

  async function openNotifications() {
    const next = !showNotif
    setShowNotif(next)
    if (next && unreadCount > 0) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)
    const text = input.trim()
    setMessages(prev => [...prev, { role: 'user', text }])
    setInput('')
    try {
      const formData = new FormData()
      formData.append('message', text)
      const res = await fetch('/api/chat', { method: 'POST', body: formData })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply || 'Done! ♡' }])
      if (data.events?.length || data.event) fetchEvents()
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Failed. Try again?' }])
    }
    setSending(false)
  }

  async function setRsvp(eventId: string, value: 'going' | null) {
    if (!who) return
    setRsvpUpdating(eventId)
    const field = who === 'dimitri' ? 'rsvp_dimitri' : 'rsvp_theresa'
    await fetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    setRsvpUpdating(null)
    fetchEvents()
  }

  const today = new Date().toISOString().split('T')[0]
  const upcoming = events.filter(e => e.date >= today && e.category !== 'city')
  const past = events.filter(e => e.date < today && e.category !== 'city')

  function RsvpRow({ ev }: { ev: Event }) {
    const dGoing = ev.rsvp_dimitri === 'going'
    const tGoing = ev.rsvp_theresa === 'going'
    const both = dGoing && tGoing
    const myRsvp = who === 'dimitri' ? ev.rsvp_dimitri : ev.rsvp_theresa
    const isUpd = rsvpUpdating === ev.id

    return (
      <div className="flex items-center gap-2">
        {both ? (
          <span className="text-xs bg-rose-500 text-white px-2.5 py-1 rounded-full font-medium">💕 Beide</span>
        ) : (
          <>
            <span className={`text-xs px-2 py-0.5 rounded-full ${dGoing ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-400'}`}>Dimi {dGoing ? '✅' : '👤'}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${tGoing ? 'bg-rose-400 text-white' : 'bg-rose-50 text-rose-300'}`}>Theresa {tGoing ? '✅' : '👤'}</span>
          </>
        )}
        {who && (
          <button
            onClick={(e) => { e.stopPropagation(); setRsvp(ev.id, myRsvp === 'going' ? null : 'going') }}
            disabled={isUpd}
            className={`text-xs px-3 py-1 rounded-full font-medium transition ${myRsvp === 'going' ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-500 hover:bg-rose-200'}`}
          >
            {isUpd ? '...' : myRsvp === 'going' ? '✅' : '🙋 Will hin'}
          </button>
        )}
      </div>
    )
  }

  if (status === 'loading') return <div className="p-8 text-stone-400">Loading...</div>

  return (
    <div className="max-w-2xl mx-auto p-6 pb-28 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold">♡ Plan</h1>
          <p className="text-sm text-stone-400 mt-0.5">Plan our time together</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button onClick={openNotifications} className="relative text-xl text-stone-500">
              🔔{unreadCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1">{unreadCount}</span>}
            </button>
            {showNotif && (
              <div className="absolute right-0 mt-2 w-72 max-h-96 bg-white border border-stone-200 rounded-xl shadow-lg z-20 p-2">
                {notifications.length === 0 ? <p className="text-sm text-stone-400 text-center py-4">Nothing yet ♡</p> : notifications.map(n => (
                  <div key={n.id} className="px-3 py-2 rounded-lg hover:bg-stone-50">
                    <p className="text-sm text-stone-700">{n.message}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {session?.user?.email ? (
            <button onClick={() => signOut()} className="text-sm text-stone-500 hover:text-stone-900">Sign out</button>
          ) : (
            <button onClick={() => signIn('google')} className="text-sm text-rose-400 hover:text-rose-600">Sign in ♡</button>
          )}
        </div>
      </header>

      {toast && <div className="fixed top-4 right-4 z-50 bg-rose-500 text-white text-sm px-4 py-3 rounded-xl shadow-lg max-w-xs">{toast}</div>}

      {/* Chat */}
      <section className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
        <h3 className="font-semibold text-stone-700">💬 Plan our next date</h3>
        <form onSubmit={sendMessage} className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder='z.B. "Kaffee morgen um 15 Uhr"' className="flex-1 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" />
          <button type="submit" disabled={!input.trim() || sending} className="bg-gradient-to-r from-rose-400 to-pink-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:from-rose-500 hover:to-pink-600 transition disabled:opacity-40 shadow-sm">{sending ? '...' : 'Send'}</button>
        </form>
        {messages.length > 0 && (
          <div className="max-h-32 overflow-y-auto space-y-1 text-sm">
            {messages.slice(-4).map((msg, i) => (
              <p key={i} className={msg.role === 'assistant' ? 'text-rose-600' : 'text-stone-600'}><span className="font-medium">{msg.role === 'assistant' ? '🤖' : '👤'}</span> {msg.text}</p>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming events with RSVP */}
      <section className="space-y-3">
        <h3 className="font-semibold text-stone-700">📅 Upcoming</h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-4">No upcoming plans. Chat to add some! ♡</p>
        ) : (
          <div className="space-y-2">
            {upcoming.slice(0, 10).map(ev => (
              <div key={ev.id} className="bg-white border border-stone-200 rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-stone-800 text-sm">{ev.title}</p>
                    <p className="text-xs text-stone-400">{ev.date}{ev.start_time ? ` · ${ev.start_time}–${ev.end_time}` : ''}</p>
                  </div>
                  <button onClick={() => setSelectedEvent(ev)} className="text-xs text-stone-400 hover:text-rose-500 transition shrink-0">Details</button>
                </div>
                <RsvpRow ev={ev} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Past events — keep them for memories, no RSVP */}
      {past.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold text-stone-700 text-sm">♡ Past</h3>
          <div className="space-y-1">
            {past.slice(0, 5).map(ev => (
              <button key={ev.id} onClick={() => setSelectedEvent(ev)} className="w-full text-left bg-stone-50 border border-stone-100 rounded-xl px-4 py-2.5 text-sm text-stone-500 hover:bg-stone-100 transition">
                <span className="font-medium">{ev.title}</span>
                <span className="text-xs ml-2 text-stone-400">{ev.date}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {selectedEvent && <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  )
}
