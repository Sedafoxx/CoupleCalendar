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
  const [messages, setMessages] = useState<{ role: string; text: string; imageUrl?: string }[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotif, setShowNotif] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const seenNotifIds = useRef<Set<string>>(new Set())
  const notifPrimed = useRef(false)
  const unreadCount = notifications.filter(n => !n.read).length

  useEffect(() => {
    fetch('/api/whoami').then(r => r.json()).then(d => setWho(d.user))
    if (status === 'authenticated' || who) {
      fetchEvents()
      fetchNotifications()
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
      const id = setInterval(fetchNotifications, 20000)
      return () => clearInterval(id)
    }
  }, [status, who])

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
    if ((!input.trim() && !imageFile) || sending) return
    setSending(true)
    const text = input.trim()
    setMessages(prev => [...prev, { role: 'user', text, imageUrl: imagePreview ?? undefined }])
    setInput('')
    const currentImage = imageFile
    setImageFile(null)
    setImagePreview(null)
    try {
      const formData = new FormData()
      if (text) formData.append('message', text)
      if (currentImage) formData.append('image', currentImage)
      const res = await fetch('/api/chat', { method: 'POST', body: formData })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply || 'Done! ♡' }])
      if (data.events?.length || data.event) fetchEvents()
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Failed. Try again?' }])
    }
    setSending(false)
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  function removeImage() {
    setImageFile(null)
    if (imagePreview) URL.revokeObjectURL(imagePreview)
    setImagePreview(null)
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

  // Theresa PIN login
  const [showPinInput, setShowPinInput] = useState(false)
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState(false)
  const [isTheresa, setIsTheresa] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/whoami').then(r => r.json()).then(d => {
      setWho(d.user)
      if (d.user === 'theresa') setIsTheresa(true)
    })
  }, [])

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
      setPinError(false)
      setIsTheresa(true)
      window.location.reload()
    } else {
      setPinError(true)
      setPinValue('')
    }
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
            <>
              <button onClick={() => signIn('google')} className="text-sm text-rose-400 hover:text-rose-600">Dimi ♡</button>
              <button onClick={() => setShowPinInput(true)} className="text-sm text-stone-400 hover:text-rose-600">Theresa 🔐</button>
            </>
          )}
          {isTheresa && <span className="text-xs text-rose-400">Theresa ♡</span>}
        </div>
      </header>

      {/* Theresa PIN modal */}
      {showPinInput && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-xs shadow-xl space-y-4 text-center">
            <p className="text-4xl">💌</p>
            <h2 className="font-bold text-lg">Hey Theresa!</h2>
            <p className="text-sm text-stone-400">Gib deinen PIN ein ♡</p>
            <form onSubmit={loginTheresa} className="space-y-3">
              <input
                type="password"
                value={pinValue}
                onChange={e => { setPinValue(e.target.value); setPinError(false) }}
                placeholder="PIN"
                className="w-full border border-rose-100 rounded-xl px-4 py-3 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-rose-300 bg-rose-50/50"
                autoFocus
              />
              {pinError && <p className="text-red-400 text-sm">Falscher PIN. Nochmal versuchen 💕</p>}
              <button type="submit" disabled={!pinValue} className="w-full bg-gradient-to-r from-rose-400 to-pink-500 text-white py-3 rounded-xl font-medium hover:from-rose-500 hover:to-pink-600 transition disabled:opacity-50 shadow-sm">
                Rein ♡
              </button>
              <button type="button" onClick={() => setShowPinInput(false)} className="text-sm text-stone-400 hover:text-stone-600">Vielleicht später</button>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="fixed top-4 right-4 z-50 bg-rose-500 text-white text-sm px-4 py-3 rounded-xl shadow-lg max-w-xs">{toast}</div>}

      {/* Chat — richtige Chat-UI mit Sprechblasen */}
      <section className="space-y-3">
        <h3 className="font-semibold text-stone-700">💬 Chat</h3>
        <div className="bg-white border border-stone-200 rounded-2xl p-4 h-64 overflow-y-auto flex flex-col gap-3">
          {messages.length === 0 && (
            <p className="text-stone-400 text-sm text-center m-auto">
              Schreib was wir machen sollen! Z.B. "Kino morgen um 19 Uhr" ♡
            </p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs rounded-2xl px-4 py-2 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-stone-900 text-white rounded-tr-sm'
                  : 'bg-rose-50 border border-rose-100 rounded-tl-sm text-stone-700'
              }`}>
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="Upload" className="rounded-lg max-h-32 object-cover w-full mb-1" />
                )}
                {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-rose-50 border border-rose-100 rounded-2xl rounded-tl-sm px-4 py-2 text-sm text-rose-400">
                Denkt nach...
              </div>
            </div>
          )}
        </div>
        {imagePreview && (
          <div className="relative inline-flex">
            <img src={imagePreview} alt="Preview" className="h-16 w-16 rounded-lg object-cover border border-stone-200" />
            <button onClick={removeImage} className="absolute -top-1.5 -right-1.5 bg-stone-900 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-stone-700 transition">×</button>
          </div>
        )}
        <form onSubmit={sendMessage} className="flex gap-2">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-stone-400 hover:text-stone-700 transition text-lg shrink-0">📎</button>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder='Was machen wir? ♡' className="flex-1 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" />
          <button type="submit" disabled={(!input.trim() && !imageFile) || sending} className="bg-gradient-to-r from-rose-400 to-pink-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:from-rose-500 hover:to-pink-600 transition disabled:opacity-40 shadow-sm">{sending ? '...' : 'Send'}</button>
        </form>
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
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-stone-800 text-sm">{ev.title}</p>
                      {ev.tags?.includes('bucket-list') && <span className="text-xs text-amber-500">✨</span>}
                    </div>
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
                {ev.tags?.includes('bucket-list') && <span className="text-amber-500 ml-1">✨</span>}
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
