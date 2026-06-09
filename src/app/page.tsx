'use client'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useState, useEffect, useRef } from 'react'
import type { Event } from '@/lib/supabase'

interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  imageUrl?: string
  event?: Event
}

export default function Dashboard() {
  const { data: session, status } = useSession()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)

  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status === 'authenticated') fetchEvents()
  }, [status])

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

  async function deleteEvent(id: string) {
    await fetch(`/api/events/${id}`, { method: 'DELETE' })
    setEvents(prev => prev.filter(e => e.id !== id))
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
      const assistantMsg: ChatMsg = {
        role: 'assistant',
        text: data.reply ?? 'Something went wrong.',
        event: data.event ?? undefined,
      }
      setMessages(prev => [...prev, assistantMsg])
      if (data.event) fetchEvents()
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
          <span className="text-sm text-stone-500">{session.user?.email}</span>
          <button
            onClick={() => signOut()}
            className="text-sm text-stone-500 hover:text-stone-900 transition"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Chat section */}
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Add Event</h2>

        {/* Messages */}
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 h-80 overflow-y-auto flex flex-col gap-3">
          {messages.length === 0 && (
            <p className="text-stone-400 text-sm text-center m-auto">
              Tell me about an event or drop a screenshot!
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
                {msg.event && (
                  <div className="mt-2 pt-2 border-t border-stone-100 space-y-0.5">
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                      Added to calendar
                    </p>
                    <p className="font-semibold">{msg.event.title}</p>
                    <p className="text-xs text-stone-500">
                      {msg.event.date} · {msg.event.start_time}–{msg.event.end_time}
                    </p>
                    {msg.event.location && (
                      <p className="text-xs text-stone-500">{msg.event.location}</p>
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

        {/* Image preview */}
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

        {/* Input bar */}
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
            placeholder="Jazz festival Saturday 7pm at Central Park..."
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

      {/* Events list */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Our Plans</h2>
          <a
            href="/plan"
            target="_blank"
            className="text-sm text-stone-500 hover:text-stone-900 underline"
          >
            Share with your love ♡
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
