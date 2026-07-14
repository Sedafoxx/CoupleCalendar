'use client'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import type { Event, BucketListItem, Notification, Rsvp } from '@/lib/supabase'
import { bothGoing } from '@/lib/supabase'

const TAG_COLORS: Record<string, string> = {
  romantic: 'bg-rose-100 text-rose-600',
  adventure: 'bg-orange-100 text-orange-600',
  food: 'bg-yellow-100 text-yellow-700',
  culture: 'bg-blue-100 text-blue-600',
  outdoor: 'bg-green-100 text-green-600',
  sport: 'bg-purple-100 text-purple-600',
}

interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  imageUrl?: string
  events?: Event[]
  bucket_list_item?: BucketListItem
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-AT', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function nextOccurrenceLabel(rule: string): string {
  const [freq, day] = rule.split(':')
  if (freq !== 'weekly') return rule
  const days: Record<string, string> = {
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
    thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
  }
  return `Every ${days[day] ?? day}`
}

export default function Dashboard() {
  const { data: session, status } = useSession()
  const [tab, setTab] = useState<'events' | 'city' | 'bucket'>('events')
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [bucketList, setBucketList] = useState<BucketListItem[]>([])
  const [bucketLoading, setBucketLoading] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [addingItem, setAddingItem] = useState(false)

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotif, setShowNotif] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const seenNotifIds = useRef<Set<string>>(new Set())
  const notifPrimed = useRef(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const unreadCount = notifications.filter(n => !n.read).length

  // Missing category (pre-migration rows) counts as a personal plan.
  const personalEvents = events.filter(e => e.category !== 'city')
  const cityEvents = events.filter(e => e.category === 'city')
  // Theresa flagged interest in a city idea, Dimi hasn't answered → needs a decision.
  const proposals = cityEvents.filter(e => e.rsvp_theresa && !e.rsvp_dimitri)

  async function setDimitriRsvp(id: string, value: Rsvp) {
    const res = await fetch(`/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      // "Ich will hin" also invites Theresa so it surfaces on her side.
      body: JSON.stringify({ rsvp_dimitri: value, joinable: value === 'going' }),
    })
    if (res.ok) {
      const updated: Event = await res.json()
      setEvents(prev => prev.map(e => e.id === id ? updated : e))
    }
  }

  // Confirm one of Theresa's proposals → both going, invite on, and promote the
  // city idea into the shared plans list.
  async function confirmProposal(id: string) {
    const res = await fetch(`/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rsvp_dimitri: 'going', joinable: true, category: 'personal' }),
    })
    if (res.ok) {
      const updated: Event = await res.json()
      setEvents(prev => prev.map(e => e.id === id ? updated : e))
    }
  }

  useEffect(() => {
    if (status === 'authenticated') {
      fetchEvents()
      fetchBucketList()
      fetchNotifications()
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission()
      }
      const id = setInterval(fetchNotifications, 20000)
      return () => clearInterval(id)
    }
  }, [status])

  async function fetchNotifications() {
    const res = await fetch('/api/notifications')
    if (!res.ok) return
    const data: Notification[] = await res.json()
    if (!Array.isArray(data)) return

    // Surface notifications we haven't shown this session (skip first load).
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function fetchEvents() {
    setLoading(true)
    const res = await fetch('/api/events')
    const data = await res.json()
    setEvents(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function fetchBucketList() {
    setBucketLoading(true)
    const res = await fetch('/api/bucket-list')
    const data = await res.json()
    setBucketList(Array.isArray(data) ? data : [])
    setBucketLoading(false)
  }

  async function deleteEvent(id: string) {
    await fetch(`/api/events/${id}`, { method: 'DELETE' })
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  async function toggleJoinable(id: string, current: boolean) {
    const res = await fetch(`/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinable: !current }),
    })
    if (res.ok) {
      const updated = await res.json()
      setEvents(prev => prev.map(e => e.id === id ? { ...e, joinable: updated.joinable } : e))
    }
  }

  async function deleteBucketItem(id: string) {
    await fetch(`/api/bucket-list/${id}`, { method: 'DELETE' })
    setBucketList(prev => prev.filter(i => i.id !== id))
  }

  async function addBucketItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newItem.trim()) return
    setAddingItem(true)
    const res = await fetch('/api/bucket-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newItem.trim(), added_by: 'dimitri' }),
    })
    if (res.ok) {
      const item = await res.json()
      setBucketList(prev => [item, ...prev])
      setNewItem('')
    }
    setAddingItem(false)
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if ((!input.trim() && !imageFile) || sending) return
    setSending(true)

    const userMsg: ChatMsg = {
      role: 'user',
      text: input.trim(),
      imageUrl: imagePreview ?? undefined,
    }
    setMessages(prev => [...prev, userMsg])

    const currentInput = input.trim()
    const currentImage = imageFile
    setInput('')
    setImageFile(null)
    setImagePreview(null)

    const formData = new FormData()
    if (currentInput) formData.append('message', currentInput)
    if (currentImage) formData.append('image', currentImage)

    try {
      const res = await fetch('/api/chat', { method: 'POST', body: formData })
      const data = await res.json()
      const evts: Event[] = data.events ?? (data.event ? [data.event] : [])
      const assistantMsg: ChatMsg = {
        role: 'assistant',
        text: data.reply ?? 'Something went wrong.',
        events: evts.length ? evts : undefined,
        bucket_list_item: data.bucket_list_item ?? undefined,
      }
      setMessages(prev => [...prev, assistantMsg])
      if (evts.length) fetchEvents()
      if (data.bucket_list_item) fetchBucketList()
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', text: 'Network error. Try again?' },
      ])
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

  if (status === 'loading') {
    return <div className="p-8 text-stone-400">Loading...</div>
  }

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

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dimi Time</h1>
        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={openNotifications}
              title="Notifications from Theresa"
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
          <button
            onClick={() => signOut()}
            className="text-sm text-stone-500 hover:text-stone-900 transition"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Toast for fresh notifications */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-rose-500 text-white text-sm px-4 py-3 rounded-xl shadow-lg max-w-xs animate-pulse">
          {toast}
        </div>
      )}

      {/* Chat section */}
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Add Event</h2>

        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 h-80 overflow-y-auto flex flex-col gap-3">
          {messages.length === 0 && (
            <p className="text-stone-400 text-sm text-center m-auto">
              Tell me about an event, drop a screenshot, or add something to your bucket list!
            </p>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs rounded-2xl px-4 py-2 text-sm space-y-1 ${
                  msg.role === 'user'
                    ? 'bg-stone-900 text-white rounded-tr-sm'
                    : 'bg-white border border-stone-200 rounded-tl-sm'
                }`}
              >
                {msg.imageUrl && (
                  <img
                    src={msg.imageUrl}
                    alt="Uploaded"
                    className="rounded-lg max-h-40 object-cover w-full"
                  />
                )}
                {msg.text && <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>}
                {msg.events && msg.events.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-stone-100 space-y-2">
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                      Added to calendar{msg.events.length > 1 ? ` · ${msg.events.length} Termine` : ''}
                    </p>
                    {msg.events.map(ev => (
                      <div key={ev.id} className="space-y-0.5">
                        <p className="font-semibold">{ev.title}</p>
                        <p className="text-xs text-stone-500">
                          {ev.type === 'window' && ev.end_date
                            ? `${fmtDate(ev.date)} – ${fmtDate(ev.end_date)}`
                            : ev.type === 'recurring' && ev.recurrence_rule
                              ? nextOccurrenceLabel(ev.recurrence_rule)
                              : `${fmtDate(ev.date)} · ${ev.start_time}–${ev.end_time}`}
                        </p>
                        {ev.location && <p className="text-xs text-stone-500">{ev.location}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {msg.bucket_list_item && (
                  <div className="mt-2 pt-2 border-t border-stone-100 space-y-0.5">
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Added to bucket list ✨</p>
                    <p className="font-semibold">{msg.bucket_list_item.title}</p>
                    {msg.bucket_list_item.tags && msg.bucket_list_item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {msg.bucket_list_item.tags.map(tag => (
                          <span key={tag} className={`text-xs px-2 py-0.5 rounded-full ${TAG_COLORS[tag] ?? 'bg-stone-100 text-stone-500'}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-white border border-stone-200 rounded-2xl rounded-tl-sm px-4 py-2 text-sm text-stone-400">
                Thinking...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {imagePreview && (
          <div className="relative inline-flex">
            <img
              src={imagePreview}
              alt="Preview"
              className="h-16 w-16 rounded-lg object-cover border border-stone-200"
            />
            <button
              onClick={removeImage}
              className="absolute -top-1.5 -right-1.5 bg-stone-900 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center leading-none hover:bg-stone-700 transition"
            >
              ×
            </button>
          </div>
        )}

        <form onSubmit={sendMessage} className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
            className="p-2 text-stone-400 hover:text-stone-700 transition text-lg"
          >
            📎
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Jazz festival Saturday 7pm... or 'add wine tasting to bucket list'"
            className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
          <button
            type="submit"
            disabled={sending || (!input.trim() && !imageFile)}
            className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-stone-700 transition disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </section>

      {/* Proposals from Theresa — city ideas she's interested in, awaiting Dimi */}
      {proposals.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold text-lg">Theresa hat Ideen ♡</h2>
          <ul className="space-y-2">
            {proposals.map(ev => (
              <li key={ev.id} className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start justify-between gap-4">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium truncate">{ev.title}</p>
                  {ev.location && <p className="text-sm text-stone-500 truncate">{ev.location}</p>}
                  <p className="text-xs text-stone-400">{fmtDate(ev.date)} · {ev.start_time}–{ev.end_time}</p>
                  <p className="text-xs text-rose-500 mt-0.5">
                    Theresa {ev.rsvp_theresa === 'going' ? 'will da hin ♡' : 'hat Interesse ♡'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={() => confirmProposal(ev.id)}
                    className="text-xs bg-rose-500 text-white px-3 py-1.5 rounded-full hover:bg-rose-600 transition"
                  >
                    Ja, machen wir ♡
                  </button>
                  <button
                    onClick={() => setDimitriRsvp(ev.id, 'maybe')}
                    className="text-xs text-stone-400 hover:text-stone-600 transition"
                  >
                    Vielleicht
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Events / City / Bucket List tabs */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex rounded-lg overflow-hidden border border-stone-200">
            <button
              onClick={() => setTab('events')}
              className={`px-4 py-2 text-sm font-medium transition ${
                tab === 'events' ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              Our Plans
            </button>
            <button
              onClick={() => setTab('city')}
              className={`px-4 py-2 text-sm font-medium transition ${
                tab === 'city' ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              Wien {cityEvents.length > 0 && <span className="opacity-60">({cityEvents.length})</span>}
            </button>
            <button
              onClick={() => setTab('bucket')}
              className={`px-4 py-2 text-sm font-medium transition ${
                tab === 'bucket' ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-50'
              }`}
            >
              Bucket List
            </button>
          </div>
          <a
            href="/plan"
            target="_blank"
            className="text-sm text-stone-500 hover:text-stone-900 underline"
          >
            Share with your love ♡
          </a>
        </div>

        {/* Events list */}
        {tab === 'events' && (
          loading ? (
            <p className="text-stone-400 text-sm">Loading...</p>
          ) : personalEvents.length === 0 ? (
            <p className="text-stone-400 text-sm">No events yet.</p>
          ) : (
            <ul className="space-y-2">
              {personalEvents.map(ev => (
                <li
                  key={ev.id}
                  className="bg-white border border-stone-200 rounded-xl p-4 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{ev.title}</p>
                      {ev.type === 'window' && (
                        <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full shrink-0">Window</span>
                      )}
                      {ev.type === 'recurring' && (
                        <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full shrink-0">Recurring</span>
                      )}
                      {ev.type === 'sleepover' && (
                        <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full shrink-0">🌙 Stayover</span>
                      )}
                      {ev.added_by === 'theresa' && (
                        <span className="text-xs text-rose-400 shrink-0">from Theresa ♡</span>
                      )}
                      {bothGoing(ev) && (
                        <span className="text-xs bg-rose-500 text-white px-2 py-0.5 rounded-full shrink-0">❤️ beide dabei</span>
                      )}
                    </div>
                    {ev.location && <p className="text-sm text-stone-500 truncate">{ev.location}</p>}
                    <p className="text-xs text-stone-400">
                      {ev.type === 'sleepover'
                        ? ev.end_date && ev.end_date !== ev.date
                          ? `${fmtDate(ev.date)} – ${fmtDate(ev.end_date)}`
                          : `${fmtDate(ev.date)} · staying over 🌙`
                        : ev.type === 'window' && ev.end_date
                          ? `${fmtDate(ev.date)} – ${fmtDate(ev.end_date)}`
                          : ev.type === 'recurring' && ev.recurrence_rule
                            ? nextOccurrenceLabel(ev.recurrence_rule)
                            : `${ev.date} · ${ev.start_time}–${ev.end_time}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <button
                      onClick={() => toggleJoinable(ev.id, ev.joinable)}
                      title={ev.joinable ? 'Theresa can join — click to hide' : 'Let Theresa join'}
                      className={`text-xs px-2 py-1 rounded-full transition ${
                        ev.joinable
                          ? 'bg-rose-100 text-rose-500 hover:bg-rose-200'
                          : 'bg-stone-100 text-stone-400 hover:bg-stone-200'
                      }`}
                    >
                      {ev.joinable ? '♡ Theresa kann mit' : '+ Theresa einladen'}
                    </button>
                    <button
                      onClick={() => deleteEvent(ev.id)}
                      className="text-stone-300 hover:text-red-400 transition text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}

        {/* City suggestions — imported Vienna events, browse & mark interest */}
        {tab === 'city' && (
          loading ? (
            <p className="text-stone-400 text-sm">Loading...</p>
          ) : cityEvents.length === 0 ? (
            <p className="text-stone-400 text-sm">Noch keine Vorschläge. Der tägliche Scan füllt das hier ♡</p>
          ) : (
            <ul className="space-y-2">
              {cityEvents.map(ev => (
                <li key={ev.id} className="bg-white border border-stone-200 rounded-xl p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {ev.url ? (
                        <a href={ev.url} target="_blank" rel="noreferrer" className="font-medium truncate hover:underline">{ev.title}</a>
                      ) : (
                        <p className="font-medium truncate">{ev.title}</p>
                      )}
                      {ev.rsvp_theresa && (
                        <span className="text-xs text-rose-400 shrink-0">Theresa: {ev.rsvp_theresa} ♡</span>
                      )}
                    </div>
                    {ev.location && <p className="text-sm text-stone-500 truncate">{ev.location}</p>}
                    <p className="text-xs text-stone-400">{fmtDate(ev.date)} · {ev.start_time}–{ev.end_time}</p>
                    {ev.tags && ev.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {ev.tags.map(tag => (
                          <span key={tag} className={`text-xs px-2 py-0.5 rounded-full ${TAG_COLORS[tag] ?? 'bg-stone-100 text-stone-500'}`}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      onClick={() => setDimitriRsvp(ev.id, ev.rsvp_dimitri === 'going' ? null : 'going')}
                      className={`text-xs px-2 py-1 rounded-full transition ${
                        ev.rsvp_dimitri === 'going' ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-500 hover:bg-rose-200'
                      }`}
                    >
                      {ev.rsvp_dimitri === 'going' ? '♡ Ich will hin' : '+ Interesse'}
                    </button>
                    <button
                      onClick={() => deleteEvent(ev.id)}
                      className="text-stone-300 hover:text-red-400 transition text-xs"
                    >
                      Ausblenden
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}

        {/* Bucket list */}
        {tab === 'bucket' && (
          <div className="space-y-3">
            <form onSubmit={addBucketItem} className="flex gap-2">
              <input
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                placeholder="Add to bucket list..."
                className="flex-1 border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
              <button
                type="submit"
                disabled={addingItem || !newItem.trim()}
                className="bg-stone-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-stone-700 transition disabled:opacity-40"
              >
                {addingItem ? '...' : '+ Add'}
              </button>
            </form>

            {bucketLoading ? (
              <p className="text-stone-400 text-sm">Loading...</p>
            ) : bucketList.length === 0 ? (
              <p className="text-stone-400 text-sm">No bucket list items yet. Add one or ask the AI!</p>
            ) : (
              <ul className="space-y-2">
                {bucketList.map(item => (
                  <li key={item.id} className="bg-white border border-stone-200 rounded-xl p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">{item.title}</p>
                      {item.description && <p className="text-sm text-stone-500">{item.description}</p>}
                      {item.duration_days && (
                        <p className="text-xs text-stone-400">{item.duration_days} day{item.duration_days > 1 ? 's' : ''}</p>
                      )}
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.tags.map(tag => (
                            <span key={tag} className={`text-xs px-2 py-0.5 rounded-full ${TAG_COLORS[tag] ?? 'bg-stone-100 text-stone-500'}`}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-stone-400">added by {item.added_by === 'theresa' ? 'Theresa ♡' : 'you'}</p>
                    </div>
                    <button
                      onClick={() => deleteBucketItem(item.id)}
                      className="text-stone-300 hover:text-red-400 transition text-sm shrink-0"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
