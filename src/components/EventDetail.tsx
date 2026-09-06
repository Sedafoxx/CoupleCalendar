'use client'
import { useState, useEffect } from 'react'
import type { Event, EventMedia } from '@/lib/supabase'
import MediaUploader from './MediaUploader'
import MediaViewer from './MediaViewer'
import VideoPreview from './VideoPreview'
import { weeklyWeekday } from '@/lib/event-utils'

// ── Helpers ────────────────────────────────────────────────
function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-AT', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ── Recurrence (weekly) editing helpers ─────────────────────
const WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sonntag' },
  { value: 1, label: 'Montag' },
  { value: 2, label: 'Dienstag' },
  { value: 3, label: 'Mittwoch' },
  { value: 4, label: 'Donnerstag' },
  { value: 5, label: 'Freitag' },
  { value: 6, label: 'Samstag' },
]
const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

// "weekly:sunday" → "jeden Sonntag" for display.
function fmtRule(rule: string | null | undefined): string {
  const wd = weeklyWeekday(rule)
  if (wd === null) return rule || ''
  return `jeden ${WEEKDAY_OPTIONS[wd].label}`
}

// ── Props ──────────────────────────────────────────────────
interface EventDetailProps {
  event: Event
  onClose: () => void
}

// ── Component ──────────────────────────────────────────────
export default function EventDetail({ event, onClose }: EventDetailProps) {
  const [deleting, setDeleting] = useState(false)
  const [media, setMedia] = useState<EventMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [showUploader, setShowUploader] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(event.title)
  const [editDate, setEditDate] = useState(event.date)
  const [editStart, setEditStart] = useState(event.start_time || '')
  const [editEnd, setEditEnd] = useState(event.end_time || '')
  const [editLocation, setEditLocation] = useState(event.location || '')
  const [editRepeat, setEditRepeat] = useState<'none' | 'weekly'>(event.recurrence_rule ? 'weekly' : 'none')
  const [editRepeatDay, setEditRepeatDay] = useState<number>(weeklyWeekday(event.recurrence_rule) ?? 0)
  const [editEndDate, setEditEndDate] = useState(event.end_date || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchMedia()
  }, [event.id])

  async function fetchMedia() {
    setLoading(true)
    try {
      const res = await fetch(`/api/event-media?event_id=${event.id}`)
      if (res.ok) {
        const data = await res.json()
        setMedia(Array.isArray(data) ? data : [])
      }
    } catch {
      // Silently fail
    }
    setLoading(false)
  }

  async function handleDeleteMedia(item: EventMedia) {
    if (!confirm('Dieses Medium wirklich löschen?')) return
    const res = await fetch(`/api/event-media/${item.id}`, { method: 'DELETE' })
    if (res.ok) {
      setMedia(prev => prev.filter(m => m.id !== item.id))
      setViewerIndex(null)
    }
  }

  async function saveEdit() {
    setSaving(true)
    const isRecurring = editRepeat === 'weekly'
    const body: Record<string, unknown> = {
      title: editTitle,
      date: editDate,
      start_time: editStart || null,
      end_time: editEnd || null,
      location: editLocation || '',
    }
    // Recurrence editing (single ↔ weekly + end of series). Leave multi-day
    // window events untouched so their date range isn't lost.
    if (event.type !== 'window') {
      body.type = isRecurring ? 'recurring' : 'single'
      body.recurrence_rule = isRecurring ? `weekly:${WEEKDAY_NAMES[editRepeatDay]}` : null
      body.end_date = isRecurring && editEndDate ? editEndDate : null
    }
    const res = await fetch(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const updated = await res.json()
      Object.assign(event, updated)
      setEditing(false)
    }
    setSaving(false)
  }

  async function deleteEvent() {
    if (!confirm('Really delete this event?')) return
    setDeleting(true)
    const res = await fetch(`/api/events/${event.id}`, { method: 'DELETE' })
    if (res.ok) onClose()
    setDeleting(false)
  }

  // Uploader full-screen
  if (showUploader) {
    return (
      <MediaUploader
        preselectedEventId={event.id}
        onDone={() => { setShowUploader(false); fetchMedia() }}
        onClose={() => setShowUploader(false)}
      />
    )
  }

  // Full-screen viewer
  if (viewerIndex !== null) {
    const gallery = media.filter(m => m.kind !== 'note')
    return (
      <MediaViewer
        items={gallery}
        initialIndex={viewerIndex}
        onClose={() => setViewerIndex(null)}
        onDelete={handleDeleteMedia}
      />
    )
  }

  const gallery = media.filter(m => m.kind !== 'note')
  const notes = media.filter(m => m.kind === 'note')

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
                {/* Repeat */}
                <div className="space-y-2 pt-1 border-t border-stone-100">
                  <label className="text-xs text-stone-400 block">Wiederholung</label>
                  <select
                    value={editRepeat}
                    onChange={e => setEditRepeat(e.target.value as 'none' | 'weekly')}
                    className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                  >
                    <option value="none">Keine Wiederholung</option>
                    <option value="weekly">Wöchentlich</option>
                  </select>
                  {editRepeat === 'weekly' && (
                    <>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-stone-400 shrink-0">Jeden</label>
                        <select
                          value={editRepeatDay}
                          onChange={e => setEditRepeatDay(Number(e.target.value))}
                          className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                        >
                          {WEEKDAY_OPTIONS.map(d => (
                            <option key={d.value} value={d.value}>{d.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-stone-400 shrink-0">Endet</label>
                        <input
                          value={editEndDate}
                          onChange={e => setEditEndDate(e.target.value)}
                          type="date"
                          className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                        />
                        <button
                          type="button"
                          onClick={() => setEditEndDate('')}
                          className="text-xs text-stone-400 hover:text-rose-500 transition shrink-0"
                        >
                          Nie
                        </button>
                      </div>
                    </>
                  )}
                </div>
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
              <p className="text-sm text-rose-400 font-medium">
                {event.recurrence_rule ? 'Ab ' : ''}{fmtDate(event.date)}
              </p>
              {event.start_time && (
                <p className="text-xs text-stone-400">
                  {event.start_time}{event.end_time ? ` – ${event.end_time}` : ''}
                </p>
              )}
              {event.recurrence_rule && (
                <p className="text-xs text-rose-400 font-medium">
                  🔁 {fmtRule(event.recurrence_rule)}{event.end_date ? ` · bis ${fmtDate(event.end_date)}` : ''}
                </p>
              )}
              <div className="flex gap-3">
                <button onClick={() => setEditing(true)} className="text-xs text-stone-400 hover:text-rose-500 transition">
                  ✏️ Edit
                </button>
                <button
                  onClick={deleteEvent}
                  disabled={deleting}
                  className="text-xs text-red-300 hover:text-red-500 transition"
                >
                  {deleting ? '...' : '🗑️ Delete'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Media section */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-stone-700">
              ♡ Erinnerungen {gallery.length > 0 && `(${gallery.length})`}
            </h3>
            <button
              onClick={() => setShowUploader(true)}
              className="bg-gradient-to-r from-rose-400 to-pink-500 text-white text-xs px-3 py-2 rounded-full font-medium hover:from-rose-500 hover:to-pink-600 transition shadow-sm"
            >
              ➕ Foto / Video / Link
            </button>
          </div>

          {loading ? (
            <p className="text-stone-400 text-sm text-center py-8">Lädt…</p>
          ) : gallery.length === 0 && notes.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-3xl">📸</p>
              <p className="text-stone-400 text-sm">
                Noch keine Erinnerungen. Füge Fotos, Videos oder einen YouTube-Link hinzu!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Photo/video/youtube grid */}
              {gallery.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5">
                  {gallery.map((m, i) => (
                    <button
                      key={m.id}
                      onClick={() => setViewerIndex(i)}
                      className="relative aspect-square rounded-lg overflow-hidden bg-stone-100 group"
                    >
                      {m.kind === 'youtube' ? (
                        <span className="absolute inset-0 flex items-center justify-center text-3xl">▶️</span>
                      ) : m.kind === 'video' ? (
                        <VideoPreview src={m.url ?? ''} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url ?? undefined} alt={m.caption ?? ''} className="w-full h-full object-cover" loading="lazy" />
                      )}
                      {m.kind === 'youtube' && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-4 h-4 text-rose-500 ml-0.5" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          </span>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Notes */}
              {notes.map(n => (
                <div key={n.id} className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">“{n.caption}”</p>
                      <p className="text-xs text-stone-400 mt-1">
                        📝 Notiz · {n.added_by === 'dimitri' ? 'Dimitri' : 'Theresa'}
                      </p>
                    </div>
                    <button onClick={() => handleDeleteMedia(n)} className="text-stone-300 hover:text-red-400 transition shrink-0">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
