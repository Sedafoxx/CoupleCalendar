'use client'
import { useState, useEffect, useRef } from 'react'
import type { Event, BucketListItem } from '@/lib/supabase'

const TAG_COLORS: Record<string, string> = {
  romantic: 'bg-rose-100 text-rose-600',
  adventure: 'bg-orange-100 text-orange-600',
  food: 'bg-yellow-100 text-yellow-700',
  culture: 'bg-blue-100 text-blue-600',
  outdoor: 'bg-green-100 text-green-600',
  sport: 'bg-purple-100 text-purple-600',
}

const HEARTS = [
  { left: '5%',  size: '1.2rem', delay: '0s',    dur: '6s'  },
  { left: '15%', size: '0.8rem', delay: '1.2s',  dur: '7s'  },
  { left: '25%', size: '1.5rem', delay: '0.4s',  dur: '5.5s'},
  { left: '38%', size: '1rem',   delay: '2s',    dur: '8s'  },
  { left: '50%', size: '1.8rem', delay: '0.8s',  dur: '6.5s'},
  { left: '62%', size: '0.9rem', delay: '1.6s',  dur: '7.5s'},
  { left: '72%', size: '1.3rem', delay: '0.2s',  dur: '6s'  },
  { left: '82%', size: '0.7rem', delay: '2.4s',  dur: '5s'  },
  { left: '91%', size: '1.1rem', delay: '1s',    dur: '7s'  },
  { left: '45%', size: '2rem',   delay: '3s',    dur: '9s'  },
]

function FloatingHearts() {
  return (
    <>
      {HEARTS.map((h, i) => (
        <span
          key={i}
          className="heart-float text-rose-300"
          style={{ left: h.left, fontSize: h.size, animationDelay: h.delay, animationDuration: h.dur }}
        >
          ♡
        </span>
      ))}
    </>
  )
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
    monday: 'Montag', tuesday: 'Dienstag', wednesday: 'Mittwoch',
    thursday: 'Donnerstag', friday: 'Freitag', saturday: 'Samstag', sunday: 'Sonntag',
  }
  return `Jeden ${days[day] ?? day}`
}

interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  imageUrl?: string
  event?: Event
  bucket_list_item?: BucketListItem
}

// ── PIN Gate ─────────────────────────────────────────────
function PinGate({ onAuth }: { onAuth: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/theresa-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    })
    if (res.ok) {
      onAuth()
    } else {
      setError('Falscher PIN. Nochmal versuchen 💕')
      setPin('')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #fff0f3 0%, #ffe4ec 50%, #ffd6e7 100%)' }}>
      <FloatingHearts />
      <div className="relative z-10 bg-white/90 backdrop-blur-sm rounded-3xl p-8 w-full max-w-xs shadow-xl space-y-6 text-center">
        <p className="text-5xl">💌</p>
        <h1 className="text-2xl font-bold text-rose-700">Hey Theresa!</h1>
        <p className="text-stone-400 text-sm">Gib deinen PIN ein ♡</p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="PIN"
            className="w-full border border-rose-100 rounded-xl px-4 py-3 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-rose-300 bg-rose-50/50"
            autoFocus
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !pin}
            className="w-full bg-gradient-to-r from-rose-400 to-pink-500 text-white py-3 rounded-xl font-medium hover:from-rose-500 hover:to-pink-600 transition disabled:opacity-50 shadow-sm"
          >
            {loading ? '...' : 'Rein ♡'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────
export default function TheresaPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'chat' | 'events' | 'bucket'>('chat')

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [events, setEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)

  const [bucketList, setBucketList] = useState<BucketListItem[]>([])
  const [bucketLoading, setBucketLoading] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [addingItem, setAddingItem] = useState(false)

  // Check auth on mount
  useEffect(() => {
    fetch('/api/theresa-auth').then(r => {
      setAuthed(r.ok)
    })
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (authed && tab === 'events') fetchEvents()
    if (authed && tab === 'bucket') fetchBucketList()
  }, [authed, tab])

  async function fetchEvents() {
    setEventsLoading(true)
    const res = await fetch('/api/events')
    const data = await res.json()
    setEvents(Array.isArray(data) ? data : [])
    setEventsLoading(false)
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
      body: JSON.stringify({ title: newItem.trim(), added_by: 'theresa' }),
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

    const userMsg: ChatMsg = { role: 'user', text: input.trim(), imageUrl: imagePreview ?? undefined }
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
      const res = await fetch('/api/theresa/chat', { method: 'POST', body: formData })
      const data = await res.json()
      const assistantMsg: ChatMsg = {
        role: 'assistant',
        text: data.reply ?? 'Etwas ist schiefgelaufen.',
        event: data.event ?? undefined,
        bucket_list_item: data.bucket_list_item ?? undefined,
      }
      setMessages(prev => [...prev, assistantMsg])
      if (data.event) fetchEvents()
      if (data.bucket_list_item) fetchBucketList()
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Netzwerkfehler. Nochmal versuchen?' }])
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

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #fff0f3 0%, #ffe4ec 50%, #ffd6e7 100%)' }}>
        <p className="text-rose-300 animate-pulse">Laden...</p>
      </div>
    )
  }

  if (!authed) {
    return <PinGate onAuth={() => setAuthed(true)} />
  }

  return (
    <div className="min-h-screen relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #fff0f3 0%, #ffe4ec 60%, #fce7f3 100%)' }}>
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1);   opacity: 0.7; }
          50%  { transform: translateY(-45vh) scale(1.1); opacity: 0.4; }
          100% { transform: translateY(-95vh) scale(0.8); opacity: 0; }
        }
        .heart-float {
          position: fixed; bottom: -2rem;
          animation: floatUp linear infinite;
          pointer-events: none; user-select: none; z-index: 0;
        }
      `}</style>

      <FloatingHearts />

      <div className="relative z-10 max-w-md mx-auto px-4 py-8 space-y-6">
        <header className="text-center space-y-1 pt-2">
          <p className="text-4xl">💌</p>
          <h1 className="text-2xl font-bold text-rose-700">Hey Theresa ♡</h1>
          <p className="text-rose-400 text-sm">Plan unsere Zeit zusammen</p>
        </header>

        {/* Tabs */}
        <div className="flex rounded-2xl overflow-hidden border border-rose-100 bg-white/60">
          {(['chat', 'events', 'bucket'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition ${
                tab === t
                  ? 'bg-rose-400 text-white'
                  : 'text-rose-400 hover:bg-rose-50'
              }`}
            >
              {t === 'chat' ? '💬 Chat' : t === 'events' ? '📅 Termine' : '✨ Wunschliste'}
            </button>
          ))}
        </div>

        {/* Chat Tab */}
        {tab === 'chat' && (
          <section className="space-y-3">
            <div className="bg-white/80 backdrop-blur-sm border border-rose-100 rounded-2xl p-4 h-96 overflow-y-auto flex flex-col gap-3">
              {messages.length === 0 && (
                <p className="text-rose-300 text-sm text-center m-auto">
                  Sag mir was du machen willst — oder frag mich wann Dimi frei ist ♡
                </p>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs rounded-2xl px-4 py-2 text-sm space-y-1 ${
                    msg.role === 'user'
                      ? 'bg-rose-400 text-white rounded-tr-sm'
                      : 'bg-white border border-rose-100 rounded-tl-sm text-stone-700'
                  }`}>
                    {msg.imageUrl && (
                      <img src={msg.imageUrl} alt="Upload" className="rounded-lg max-h-40 object-cover w-full" />
                    )}
                    {msg.text && <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>}
                    {msg.event && (
                      <div className="mt-2 pt-2 border-t border-rose-100 space-y-0.5">
                        <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide">Zum Kalender hinzugefügt</p>
                        <p className="font-semibold">{msg.event.title}</p>
                        <p className="text-xs text-stone-400">
                          {msg.event.type === 'window'
                            ? `${fmtDate(msg.event.date)} – ${fmtDate(msg.event.end_date!)}`
                            : msg.event.type === 'recurring'
                              ? nextOccurrenceLabel(msg.event.recurrence_rule!)
                              : `${fmtDate(msg.event.date)} · ${msg.event.start_time}–${msg.event.end_time}`}
                        </p>
                      </div>
                    )}
                    {msg.bucket_list_item && (
                      <div className="mt-2 pt-2 border-t border-rose-100 space-y-0.5">
                        <p className="text-xs font-semibold text-rose-400 uppercase tracking-wide">Zur Wunschliste hinzugefügt ✨</p>
                        <p className="font-semibold">{msg.bucket_list_item.title}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-white border border-rose-100 rounded-2xl rounded-tl-sm px-4 py-2 text-sm text-rose-300">
                    Denke nach...
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {imagePreview && (
              <div className="relative inline-flex">
                <img src={imagePreview} alt="Preview" className="h-16 w-16 rounded-lg object-cover border border-rose-100" />
                <button
                  onClick={removeImage}
                  className="absolute -top-1.5 -right-1.5 bg-rose-400 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center leading-none hover:bg-rose-500 transition"
                >×</button>
              </div>
            )}

            <form onSubmit={sendMessage} className="flex items-center gap-2">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-rose-300 hover:text-rose-500 transition text-lg"
              >📎</button>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Was sollen wir machen? ♡"
                className="flex-1 border border-rose-100 rounded-xl px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
              <button
                type="submit"
                disabled={sending || (!input.trim() && !imageFile)}
                className="bg-gradient-to-r from-rose-400 to-pink-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:from-rose-500 hover:to-pink-600 transition disabled:opacity-40 shadow-sm"
              >
                Senden
              </button>
            </form>
          </section>
        )}

        {/* Events Tab */}
        {tab === 'events' && (
          <section className="space-y-3">
            {eventsLoading ? (
              <p className="text-rose-300 text-sm text-center animate-pulse">Lade Termine...</p>
            ) : events.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-3xl">🗓️</p>
                <p className="text-stone-400 text-sm">Noch keine Termine. Plan etwas im Chat!</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {events.map(ev => (
                  <li key={ev.id} className="bg-white/80 backdrop-blur-sm border border-rose-100 rounded-2xl p-4 flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-stone-800 truncate">{ev.title}</p>
                        {ev.type === 'window' && (
                          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full shrink-0">Zeitraum</span>
                        )}
                        {ev.type === 'recurring' && (
                          <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full shrink-0">Wiederkehrend</span>
                        )}
                        {ev.added_by === 'theresa' && (
                          <span className="text-xs text-rose-400 shrink-0">von dir ♡</span>
                        )}
                      </div>
                      {ev.location && <p className="text-xs text-stone-400 truncate">{ev.location}</p>}
                      <p className="text-xs text-rose-300">
                        {ev.type === 'window' && ev.end_date
                          ? `${fmtDate(ev.date)} – ${fmtDate(ev.end_date)}`
                          : ev.type === 'recurring' && ev.recurrence_rule
                            ? nextOccurrenceLabel(ev.recurrence_rule)
                            : `${fmtDate(ev.date)} · ${ev.start_time}–${ev.end_time} Uhr`}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteEvent(ev.id)}
                      className="text-stone-200 hover:text-red-400 transition text-lg shrink-0 pt-0.5"
                      title="Löschen"
                    >×</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Bucket List Tab */}
        {tab === 'bucket' && (
          <section className="space-y-4">
            <form onSubmit={addBucketItem} className="flex gap-2">
              <input
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
                placeholder="Neue Idee hinzufügen..."
                className="flex-1 border border-rose-100 rounded-xl px-3 py-2 text-sm bg-white/80 focus:outline-none focus:ring-2 focus:ring-rose-300"
              />
              <button
                type="submit"
                disabled={addingItem || !newItem.trim()}
                className="bg-gradient-to-r from-rose-400 to-pink-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:from-rose-500 hover:to-pink-600 transition disabled:opacity-40 shadow-sm"
              >
                {addingItem ? '...' : '+ Hinzufügen'}
              </button>
            </form>

            {bucketLoading ? (
              <p className="text-rose-300 text-sm text-center animate-pulse">Laden...</p>
            ) : bucketList.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-3xl">✨</p>
                <p className="text-stone-400 text-sm">Noch keine Wünsche. Füg was hinzu!</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {bucketList.map(item => (
                  <li key={item.id} className="bg-white/80 backdrop-blur-sm border border-rose-100 rounded-2xl p-4 flex items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <p className="font-medium text-stone-800">{item.title}</p>
                      {item.description && <p className="text-xs text-stone-400">{item.description}</p>}
                      {item.duration_days && (
                        <p className="text-xs text-rose-300">{item.duration_days} Tag{item.duration_days > 1 ? 'e' : ''}</p>
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
                      <p className="text-xs text-rose-200">von {item.added_by === 'theresa' ? 'dir ♡' : 'Dimi'}</p>
                    </div>
                    <button
                      onClick={() => deleteBucketItem(item.id)}
                      className="text-stone-200 hover:text-red-400 transition text-lg shrink-0 pt-0.5"
                      title="Löschen"
                    >×</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
