'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import type { Memory, Event, Notification } from '@/lib/supabase'
import MemoryCard from '@/components/MemoryCard'
import DualCamera from '@/components/DualCamera'
import EventDetail from '@/components/EventDetail'

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

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotif, setShowNotif] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const seenNotifIds = useRef<Set<string>>(new Set())
  const notifPrimed = useRef(false)

  const unreadCount = notifications.filter(n => !n.read).length

  // Fetch data
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
    } catch {
      // Silent fail
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchAll()
      fetchNotifications()
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
      }
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
        const latest = newUnread[0]
        setToast(latest.message)
        setTimeout(() => setToast(null), 6000)
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Dimi Time ♡', { body: latest.message })
        }
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

  function handleMemorySaved() {
    setShowCamera(false)
    fetchAll()
  }

  function handleMemoryClick(memory: Memory) {
    setSelectedMemory(memory)
  }

  // Loading state
  if (status === 'loading') {
    return <div className="p-8 text-stone-400">Loading...</div>
  }

  // Unauthenticated
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-4xl">♡</p>
          <h1 className="text-3xl font-bold">Dimi Time</h1>
          <p className="text-stone-500">Time together, planned with love.</p>
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

  // Camera full-screen
  if (showCamera) {
    return (
      <DualCamera
        onSaved={handleMemorySaved}
        onClose={() => setShowCamera(false)}
      />
    )
  }

  // Full-screen memory view
  if (selectedMemory) {
    return (
      <div className="fixed inset-0 z-50 bg-black overflow-y-auto">
        <div className="min-h-full flex flex-col">
          <div className="flex-1 bg-stone-900 flex items-center justify-center min-h-[50vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedMemory.photo_back} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="relative h-[28vh] bg-stone-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedMemory.photo_front} alt="" className="w-full h-full object-cover opacity-90" />
            <div className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 -translate-y-1/2">
              <div className="flex-1 h-px bg-white/30" />
              <span className="text-white/60 text-xs bg-stone-800 px-3 py-1 rounded-full">
                📸 {selectedMemory.captured_by === 'dimitri' ? 'Dimitri' : 'Theresa'}
              </span>
              <div className="flex-1 h-px bg-white/30" />
            </div>
          </div>
          <div className="bg-white rounded-t-3xl p-6 space-y-3 -mt-4 relative z-10">
            {selectedMemory.caption && (
              <p className="text-stone-700 text-sm leading-relaxed">&ldquo;{selectedMemory.caption}&rdquo;</p>
            )}
            <p className="text-xs text-stone-400">
              {new Date(selectedMemory.created_at).toLocaleDateString('de-AT', {
                weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
              })}
            </p>
            <button
              onClick={() => setSelectedMemory(null)}
              className="w-full border border-stone-200 py-2.5 rounded-xl text-sm text-stone-500 hover:bg-stone-50 transition"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main timeline
  return (
    <div className="max-w-2xl mx-auto p-6 pb-28 space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold">♡ Memories</h1>
          <p className="text-sm text-stone-400 mt-0.5">Our moments together</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={openNotifications}
              title="Notifications"
              className="relative text-xl text-stone-500 hover:text-stone-900 transition"
            >
              🔔
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            {showNotif && (
              <div className="absolute right-0 mt-2 w-72 max-h-96 overflow-y-auto bg-white border border-stone-200 rounded-xl shadow-lg z-20 p-2 space-y-1">
                {notifications.length === 0 ? (
                  <p className="text-sm text-stone-400 text-center py-4">Nothing yet ♡</p>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className="px-3 py-2 rounded-lg hover:bg-stone-50">
                      <p className="text-sm text-stone-700">{n.message}</p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        {new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <span className="text-sm text-stone-500">{session.user?.email}</span>
          <button onClick={() => signOut()} className="text-sm text-stone-500 hover:text-stone-900 transition">Sign out</button>
          <button onClick={() => setShowDebug(!showDebug)} className="text-xs text-stone-300 hover:text-stone-500 transition">⚙</button>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-rose-500 text-white text-sm px-4 py-3 rounded-xl shadow-lg max-w-xs animate-pulse">
          {toast}
        </div>
      )}

      {/* Memories feed — combine photo memories + past events without photos */}
      <section className="space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-stone-50 rounded-2xl h-64 animate-pulse" />
            ))}
          </div>
        ) : (() => {
          // Merge photo memories + past events into one chronologically-sorted feed
          const pastEventsWithoutPhotos = pastEvents.filter(ev =>
            ev.date < new Date().toISOString().split('T')[0] &&
            ev.category !== 'city' &&
            !memories.some(m => m.event_id === ev.id)
          )

          // Build combined feed items
          type FeedItem = { id: string; date: string; type: 'memory' | 'event'; data: Memory | Event; event_title?: string }
          const feed: FeedItem[] = [
            ...memories.map(m => ({ id: m.id, date: m.event_date || m.created_at.split('T')[0], type: 'memory' as const, data: m, event_title: m.event_title })),
            ...pastEventsWithoutPhotos.map(ev => ({ id: ev.id, date: ev.date, type: 'event' as const, data: ev })),
          ]

          // Sort by date descending (newest first)
          feed.sort((a, b) => b.date.localeCompare(a.date))

          return feed.length > 0 ? (
            feed.map(item =>
              item.type === 'memory' ? (
                <MemoryCard
                  key={item.id}
                  memory={item.data as Memory}
                  onClick={() => handleMemoryClick(item.data as Memory)}
                />
              ) : (
                <button
                  key={item.id}
                  onClick={() => setSelectedEvent(item.data as Event)}
                  className="w-full text-left bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-rose-200 transition group"
                >
                  <div className="h-32 bg-gradient-to-br from-rose-100 via-pink-50 to-stone-100 flex items-center justify-center">
                    <div className="text-center">
                      <span className="text-4xl">♡</span>
                      <p className="text-rose-300 text-xs mt-1 font-medium">Memory</p>
                    </div>
                  </div>
                  <div className="px-4 py-3 space-y-1">
                    <span className="font-semibold text-sm text-stone-800 truncate block">{(item.data as Event).title}</span>
                    <p className="text-xs text-stone-400">
                      {new Date((item.data as Event).date + 'T00:00:00').toLocaleDateString('de-AT', {
                        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                      })}
                      {(item.data as Event).start_time && ` · ${(item.data as Event).start_time}–${(item.data as Event).end_time}`}
                    </p>
                    <p className="text-xs text-rose-400 font-medium opacity-0 group-hover:opacity-100 transition">+ Add Photos 📸</p>
                  </div>
                </button>
              )
            )
          ) : (
            <div className="text-center py-16 space-y-4">
              <p className="text-6xl">📸</p>
              <h2 className="text-xl font-semibold text-stone-700">No memories yet</h2>
              <p className="text-stone-400 text-sm max-w-xs mx-auto">
                Capture your first moment together! Take a BeReal-style photo and attach it to an event.
              </p>
            </div>
          )
        })()}
      </section>

      {/* Debug panel */}
      {showDebug && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-xs text-stone-500 space-y-1 font-mono">
          <p>Memories: {memories.length}</p>
          <p>Events: {events.length}</p>
          <p>Notifications: {notifications.length}</p>
          <button onClick={fetchAll} className="text-rose-400 hover:text-rose-600 transition underline">
            Refresh data
          </button>
        </div>
      )}

      {/* FAB — Floating capture button */}
      <button
        onClick={() => setShowCamera(true)}
        className="fixed bottom-20 right-6 z-30 w-14 h-14 rounded-full bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-lg flex items-center justify-center text-2xl hover:from-rose-500 hover:to-pink-600 transition active:scale-95"
      >
        📸
      </button>

      {/* Event detail modal — for past events without photos */}
      {selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  )
}
