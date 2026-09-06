'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import type { Event, EventMedia, Notification } from '@/lib/supabase'
import EventDetail from '@/components/EventDetail'
import FeedCards from '@/components/FeedCards'
import MediaUploader from '@/components/MediaUploader'

export default function MemoriesPage() {
  const { data: session, status } = useSession()
  const [media, setMedia] = useState<EventMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [showUploader, setShowUploader] = useState(false)
  const [uploadEventId, setUploadEventId] = useState<string | undefined>(undefined)
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [pastEvents, setPastEvents] = useState<Event[]>([])
  const [who, setWho] = useState<'dimitri' | 'theresa' | null>(null)

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotif, setShowNotif] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const seenNotifIds = useRef<Set<string>>(new Set())
  const notifPrimed = useRef(false)

  const unreadCount = notifications.filter(n => !n.read).length

  const fetchAll = useCallback(async () => {
    try {
      const [mediaRes, pastRes] = await Promise.all([
        fetch('/api/event-media?recent=true&limit=200'),
        fetch('/api/events?past=true'),
      ])
      const mediaData = await mediaRes.json()
      const pastData = await pastRes.json()
      setMedia(Array.isArray(mediaData) ? mediaData : [])
      setPastEvents(Array.isArray(pastData) ? pastData : [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetch('/api/whoami').then(r => r.json()).then(d => setWho(d.user))
    if (status === 'authenticated' || who) {
      fetchAll()
      fetchNotifications()
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
      const id = setInterval(fetchNotifications, 20000)
      return () => clearInterval(id)
    }
  }, [status, who, fetchAll])

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

  // From a gallery card's edit, open the underlying event detail.
  function handleEditEvent(ev: Event) { setSelectedEvent(ev) }

  // From a card's "+" (empty event), open the uploader pre-scoped to that event.
  function handleAddMedia(ev: Event) {
    setUploadEventId(ev.id)
    setShowUploader(true)
  }

  // The global FAB picks any event.
  function handleAddAny() {
    setUploadEventId(undefined)
    setShowUploader(true)
  }

  // Delete a single media item from the full-screen viewer.
  async function handleDeleteMedia(item: EventMedia) {
    if (!confirm('Dieses Medium wirklich löschen?')) return
    const res = await fetch(`/api/event-media/${item.id}`, { method: 'DELETE' })
    if (res.ok) fetchAll()
  }

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

  if (!session && !who) {
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

  if (showUploader) {
    return (
      <MediaUploader
        preselectedEventId={uploadEventId}
        onClose={() => setShowUploader(false)}
        onDone={fetchAll}
      />
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
          {session?.user?.email ? <span className="text-sm text-stone-500">{session.user.email}</span> : who === 'theresa' && <span className="text-xs text-rose-400">Theresa ♡</span>}
          {session?.user?.email ? (
            <button onClick={() => signOut()} className="text-sm text-stone-500 hover:text-stone-900 transition">Sign out</button>
          ) : who === 'theresa' ? (
            <button onClick={() => signOut()} className="text-sm text-stone-400 hover:text-stone-600 transition">Logout</button>
          ) : (
            <button onClick={() => signIn('google')} className="text-sm text-rose-400 hover:text-rose-600 transition">Sign in ♡</button>
          )}
          <button onClick={() => setShowDebug(!showDebug)} className="text-xs text-stone-300 hover:text-stone-500 transition">⚙</button>
        </div>
      </header>

      {toast && <div className="fixed top-4 right-4 z-50 bg-rose-500 text-white text-sm px-4 py-3 rounded-xl shadow-lg max-w-xs">{toast}</div>}

      <section className="space-y-4">
        {loading ? (
          <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="bg-stone-50 rounded-2xl h-64 animate-pulse" />)}</div>
        ) : null}
        {!loading && (
          <FeedCards
            pastEvents={pastEvents}
            media={media}
            onSelectEvent={handleEditEvent}
            onDeleteMedia={handleDeleteMedia}
            onAddMedia={handleAddMedia}
            onUpdated={fetchAll}
            showRsvp={false}
          />
        )}
      </section>

      {showDebug && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-xs space-y-1 font-mono">
          <p>Media: {media.length} | Past: {pastEvents.length}</p>
          <button onClick={fetchAll} className="text-rose-400 hover:text-rose-600 underline">Refresh</button>
        </div>
      )}

      <button onClick={handleAddAny} className="fixed bottom-20 right-6 z-30 w-14 h-14 rounded-full bg-gradient-to-r from-rose-400 to-pink-500 text-white shadow-lg flex items-center justify-center text-2xl hover:from-rose-500 hover:to-pink-600 transition active:scale-95">➕</button>

      {selectedEvent && <EventDetail event={selectedEvent} onClose={() => { setSelectedEvent(null); fetchAll() }} />}
    </div>
  )
}
