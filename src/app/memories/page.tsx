'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import type { Memory, Event, Notification } from '@/lib/supabase'
import DualCamera from '@/components/DualCamera'
import EventDetail from '@/components/EventDetail'
import FeedCards from '@/components/FeedCards'

export default function MemoriesPage() {
  const { data: session, status } = useSession()
  const [memories, setMemories] = useState<(Memory & { event_title?: string; event_date?: string })[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showCamera, setShowCamera] = useState(false)
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [pastEvents, setPastEvents] = useState<Event[]>([])

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotif, setShowNotif] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const seenNotifIds = useRef<Set<string>>(new Set())
  const notifPrimed = useRef(false)

  const unreadCount = notifications.filter(n => !n.read).length

  const fetchAll = useCallback(async () => {
    try {
      const [memoriesRes, eventsRes, pastRes] = await Promise.all([
        fetch('/api/memories?recent=true&limit=50'),
        fetch('/api/events'),
        fetch('/api/events?past=true'),
      ])
      const memoriesData = await memoriesRes.json()
      const eventsData = await eventsRes.json()
      const pastData = await pastRes.json()
      setMemories(Array.isArray(memoriesData) ? memoriesData : [])
      setEvents(Array.isArray(eventsData) ? eventsData : [])
      setPastEvents(Array.isArray(pastData) ? pastData : [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchAll()
      fetchNotifications()
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
      const id = setInterval(fetchNotifications, 20000)
      return () => clearInterval(id)
    }
  }, [status, fetchAll])

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

  function handleMemorySaved() { setShowCamera(false); fetchAll() }
  function handleMemoryClick(memory: Memory) { setSelectedMemory(memory) }

  if (status === 'loading') return <div className="p-8 text-stone-400">Loading...</div>

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
    if (res.ok) {
      setShowPinInput(false)
      setPinValue('')
      window.location.reload()
    } else {
      setPinError(true)
      setPinValue('')
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-4xl">♡</p>
          <h1 className="text-3xl font-bold">Dimi Time</h1>
          <p className="text-stone-500">Time together, planned with love.</p>
          <button onClick={() => signIn('google')} className="bg-stone-900 text-white px-6 py-3 rounded-lg hover:bg-stone-700 transition">
            Dimi ♡
          </button>
          <button onClick={() => setShowPinInput(true)} className="text-rose-400 hover:text-rose-600 underline text-sm">
            Theresa 🔐
          </button>
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

  if (showCamera) return <DualCamera onSaved={handleMemorySaved} onClose={() => setShowCamera(false)} />

  if (selectedMemory) {
    return (
      <div className="fixed inset-0 z-50 bg-black overflow-y-auto">
        <div className="min-h-full flex flex-col">
          <div className="flex-1 bg-stone-900 min-h-[50vh] flex items-center justify-center">
            <img src={selectedMemory.photo_back} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="relative h-[28vh] bg-stone-800">
            <img src={selectedMemory.photo_front} alt="" className="w-full h-full object-cover opacity-90" />
          </div>
          <div className="bg-white rounded-t-3xl p-6 -mt-4 relative z-10 space-y-3">
            {selectedMemory.caption && <p className="text-stone-700 text-sm">&ldquo;{selectedMemory.caption}&rdquo;</p>}
            <button onClick={() => setSelectedMemory(null)} className="w-full border border-stone-200 py-2.5 rounded-xl text-sm text-stone-500 hover:bg-stone-50 transition">Back</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6 pb-28 space-y-6">
      <header className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold">♡ Memories</h1>
          <p className="text-sm text-stone-400 mt-0.5">Our moments together</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <button onClick={openNotifications} className="relative text-xl text-stone-500 hover:text-stone-900 transition">
              🔔{unreadCount > 0 && <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{unreadCount}</span>}
            </button>
            {showNotif && (
              <div className="absolute right-0 mt-2 w-72 max-h-96 bg-white border border-stone-200 rounded-xl shadow-lg z-20 p-2 space-y-1">
                {notifications.length === 0 ? <p className="text-sm text-stone-400 text-center py-4">Nothing yet ♡</p> : notifications.map(n => (
                  <div key={n.id} className="px-3 py-2 rounded-lg hover:bg-stone-50">
                    <p className="text-sm text-stone-700">{n.message}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          <span className="text-sm text-stone-500">{session.user?.email}</span>
          <button onClick={() => signOut()} className="text-sm text-stone-500 hover:text-stone-900 transition">Sign out</button>
          <button onClick={() => setShowDebug(!showDebug)} className="text-xs text-stone-300 hover:text-stone-500 transition">⚙</button>
        </div>
      </header>

      {toast && <div className="fixed top-4 right-4 z-50 bg-rose-500 text-white text-sm px-4 py-3 rounded-xl shadow-lg max-w-xs">{toast}</div>}

      <section className="space-y-4">
        {loading ? (
          <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="bg-stone-50 rounded-2xl h-64 animate-pulse" />)}</div>
        ) : null}
        {!loading && <FeedCards pastEvents={pastEvents} memories={memories} onSelectEvent={setSelectedEvent} onSelectMemory={handleMemoryClick} showRsvp={false} />}
      </section>

      {showDebug && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-xs space-y-1 font-mono">
          <p>Memories: {memories.length} | Past: {pastEvents.length}</p>
          <button onClick={fetchAll} className="text-rose-400 hover:text-rose-600 underline">Refresh</button>
        </div>
      )}

      <button onClick={() => setShowCamera(true)} className="fixed bottom-20 right-6 z-30 w-14 h-14 rounded-full bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-lg flex items-center justify-center text-2xl hover:from-rose-500 hover:to-pink-600 transition active:scale-95">📸</button>

      {selectedEvent && <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </div>
  )
}
