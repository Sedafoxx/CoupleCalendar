'use client'
import { useState, useEffect } from 'react'
import type { Event, Memory } from '@/lib/supabase'
import DualCamera from './DualCamera'

// ── Helpers ────────────────────────────────────────────────
function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-AT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtTime(timeStr: string) {
  return timeStr // Already in HH:MM format
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })
}

// ── Props ──────────────────────────────────────────────────
interface EventDetailProps {
  event: Event
  onClose: () => void
}

// ── Component ──────────────────────────────────────────────
export default function EventDetail({ event, onClose }: EventDetailProps) {
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [showCamera, setShowCamera] = useState(false)
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(event.title)
  const [editDate, setEditDate] = useState(event.date)
  const [editStart, setEditStart] = useState(event.start_time || '')
  const [editEnd, setEditEnd] = useState(event.end_time || '')
  const [editLocation, setEditLocation] = useState(event.location || '')
  const [saving, setSaving] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  useEffect(() => {
    fetchMemories()
  }, [event.id])

  async function fetchMemories() {
    setLoading(true)
    try {
      const res = await fetch(`/api/memories?event_id=${event.id}`)
      if (res.ok) {
        const data = await res.json()
        setMemories(Array.isArray(data) ? data : [])
      }
    } catch {
      // Silently fail
    }
    setLoading(false)
  }

  function handleSaved() {
    setShowCamera(false)
    fetchMemories()
  }

  async function handleDeleteMemory(id: string) {
    const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setMemories((prev) => prev.filter((m) => m.id !== id))
    }
  }

  async function saveEdit() {
    setSaving(true)
    const res = await fetch(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: editTitle,
        date: editDate,
        start_time: editStart || null,
        end_time: editEnd || null,
        location: editLocation || '',
      }),
    })
    if (res.ok) {
      const updated = await res.json()
      Object.assign(event, updated)
      setEditing(false)
    }
    setSaving(false)
  }

  async function addNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    // Create a text-only memory (no photos)
    const formData = new FormData()
    // Use a 1x1 transparent pixel as placeholder for both photos
    const emptyPixel = new Blob([new Uint8Array([71,73,70,56,57,97,1,0,1,0,128,0,0,255,255,255,0,0,0,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59])], { type: 'image/gif' })
    formData.append('photo_front', emptyPixel, 'note.gif')
    formData.append('photo_back', emptyPixel, 'note.gif')
    formData.append('event_id', event.id)
    formData.append('caption', noteText.trim())

    const res = await fetch('/api/memories', { method: 'POST', body: formData })
    if (res.ok) {
      setNoteText('')
      fetchMemories()
    }
    setSavingNote(false)
  }

  // Full-screen memory view
  if (selectedMemory) {
    return (
      <div className="fixed inset-0 z-50 bg-black overflow-y-auto">
        <div className="min-h-full flex flex-col">
          {/* Back camera photo */}
          <div className="flex-1 bg-stone-900 flex items-center justify-center min-h-[50vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedMemory.photo_back}
              alt="Memory"
              className="w-full h-full object-cover"
            />
          </div>

          {/* Front camera photo */}
          <div className="relative h-[28vh] bg-stone-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedMemory.photo_front}
              alt="Selfie"
              className="w-full h-full object-cover opacity-90"
            />
            <div className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 -translate-y-1/2">
              <div className="flex-1 h-px bg-white/30" />
              <span className="text-white/60 text-xs bg-stone-800 px-3 py-1 rounded-full">
                📸 {selectedMemory.captured_by === 'dimitri' ? 'Dimitri' : 'Theresa'}
              </span>
              <div className="flex-1 h-px bg-white/30" />
            </div>
          </div>

          {/* Info overlay at bottom */}
          <div className="bg-white rounded-t-3xl p-6 space-y-3 -mt-4 relative z-10">
            {selectedMemory.caption && (
              <p className="text-stone-700 text-sm leading-relaxed">
                &ldquo;{selectedMemory.caption}&rdquo;
              </p>
            )}
            <p className="text-xs text-stone-400">
              {timeAgo(selectedMemory.created_at)}
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setSelectedMemory(null)}
                className="flex-1 border border-stone-200 py-2.5 rounded-xl text-sm text-stone-500 hover:bg-stone-50 transition"
              >
                Back
              </button>
              <button
                onClick={() => {
                  handleDeleteMemory(selectedMemory.id)
                  setSelectedMemory(null)
                }}
                className="px-4 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-50 transition"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Camera view
  if (showCamera) {
    return (
      <DualCamera
        preselectedEventId={event.id}
        onSaved={handleSaved}
        onClose={() => setShowCamera(false)}
      />
    )
  }

  // Normal detail view
  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Event header */}
        <div className="p-6 pb-4 space-y-2 border-b border-stone-100">
          <div className="flex items-start justify-between gap-4">
            {editing ? (
              <div className="flex-1 space-y-2">
                <input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-rose-300" />
                <input value={editDate} onChange={e => setEditDate(e.target.value)} type="date" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
                <div className="flex gap-2">
                  <input value={editStart} onChange={e => setEditStart(e.target.value)} type="time" className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
                  <input value={editEnd} onChange={e => setEditEnd(e.target.value)} type="time" className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
                </div>
                <input value={editLocation} onChange={e => setEditLocation(e.target.value)} placeholder="Location" className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300" />
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setEditing(false)} className="flex-1 border border-stone-200 py-2 rounded-xl text-sm text-stone-500 hover:bg-stone-50 transition">Cancel</button>
                  <button onClick={saveEdit} disabled={saving} className="flex-1 bg-rose-400 text-white py-2 rounded-xl text-sm font-medium hover:bg-rose-500 transition disabled:opacity-40">Save</button>
                </div>
              </div>
            ) : (
              <div className="min-w-0 space-y-1">
                <h2 className="text-xl font-bold text-stone-800">{event.title}</h2>
                {event.location && <p className="text-sm text-stone-500">{event.location}</p>}
              </div>
            )}
            <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 transition shrink-0">✕</button>
          </div>
          {!editing && (
            <>
              <p className="text-sm text-rose-400 font-medium">{fmtDate(event.date)}</p>
              {event.start_time && (
                <p className="text-xs text-stone-400">
                  {fmtTime(event.start_time)}{event.end_time ? ` – ${fmtTime(event.end_time)}` : ''}
                </p>
              )}
              <button onClick={() => setEditing(true)} className="text-xs text-stone-400 hover:text-rose-500 transition">
                ✏️ Edit
              </button>
            </>
          )}
        </div>

        {/* Memories section */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-stone-700">
              Memories {memories.length > 0 && `(${memories.length})`}
            </h3>
            <div className="flex gap-1">
              <button
                onClick={() => setShowCamera(true)}
                className="bg-gradient-to-r from-rose-400 to-pink-500 text-white text-xs px-3 py-2 rounded-full font-medium hover:from-rose-500 hover:to-pink-600 transition shadow-sm"
              >
                📸 Photo
              </button>
            </div>
          </div>

          {/* Add a text note */}
          <div className="flex gap-2">
            <input
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add a note about this memory..."
              className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
              maxLength={500}
            />
            <button
              onClick={addNote}
              disabled={savingNote || !noteText.trim()}
              className="bg-stone-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-stone-700 transition disabled:opacity-40"
            >
              {savingNote ? '...' : 'Add Note'}
            </button>
          </div>

          {loading ? (
            <p className="text-stone-400 text-sm text-center py-8">Loading memories...</p>
          ) : memories.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-3xl">📸</p>
              <p className="text-stone-400 text-sm">
                No memories yet. Capture this moment!
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {memories.map((memory) => {
                const isNote = memory.photo_back.includes('note.gif')
                return isNote ? (
                  /* Text note card */
                  <div key={memory.id} className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{memory.caption}</p>
                        <p className="text-xs text-stone-400 mt-1">
                          📝 Notiz · {memory.captured_by === 'dimitri' ? 'Dimitri' : 'Theresa'} · {timeAgo(memory.created_at)}
                        </p>
                      </div>
                      <button onClick={() => handleDeleteMemory(memory.id)} className="text-stone-300 hover:text-red-400 transition shrink-0">✕</button>
                    </div>
                  </div>
                ) : (
                  /* Photo memory card */
                  <button
                    key={memory.id}
                    onClick={() => setSelectedMemory(memory)}
                    className="w-full text-left bg-stone-50 rounded-2xl overflow-hidden hover:bg-stone-100 transition"
                  >
                    <div className="flex h-32">
                      <div className="flex-1 relative">
                        <img src={memory.photo_back} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="w-20 relative">
                        <img src={memory.photo_front} alt="" className="w-full h-full object-cover opacity-80" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-white text-xs bg-black/40 px-1.5 py-0.5 rounded">selfie</span>
                        </div>
                      </div>
                    </div>
                    <div className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        {memory.caption ? (
                          <p className="text-sm text-stone-700 truncate">{memory.caption}</p>
                        ) : (
                          <p className="text-sm text-stone-400 italic">No caption</p>
                        )}
                        <p className="text-xs text-stone-400 mt-0.5">
                          {memory.captured_by === 'dimitri' ? 'Dimitri' : 'Theresa'} · {timeAgo(memory.created_at)}
                        </p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteMemory(memory.id) }} className="text-stone-300 hover:text-red-400 transition text-sm shrink-0">✕</button>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
