'use client'
import { useState, useEffect, useRef } from 'react'
import type { Event } from '@/lib/supabase'
import { extractYouTubeId, youtubeWatchUrl } from '@/lib/youtube'

// Modal for adding media to an event: pick multiple photos/videos from the
// device, paste a YouTube link, and/or write a text note. Each selected file /
// link / note becomes its own event_media item (see POST /api/event-media).

interface MediaUploaderProps {
  /** Pre-selected event id — hides the event picker. */
  preselectedEventId?: string
  /** True when opened from inside an event whose data we already have. */
  onDone?: () => void
  onClose: () => void
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-AT', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

export default function MediaUploader({ preselectedEventId, onDone, onClose }: MediaUploaderProps) {
  const [events, setEvents] = useState<Event[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(preselectedEventId ?? null)

  // Files chosen from the device (photos + videos, multiselect)
  const [files, setFiles] = useState<File[]>([])
  // YouTube URL to attach
  const [youtubeUrl, setYoutubeUrl] = useState('')
  // Text note to attach
  const [noteText, setNoteText] = useState('')

  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/events?past=true')
      .then((r) => r.json())
      .then((data) => { setEvents(Array.isArray(data) ? data : []); setEventsLoading(false) })
      .catch(() => setEventsLoading(false))
  }, [])

  const hasAnything =
    (files.length > 0) ||
    !!youtubeUrl.trim() ||
    !!noteText.trim()

  function clearForm() {
    setFiles([])
    setYoutubeUrl('')
    setNoteText('')
    setCaption('')
    setError(null)
    setSuccess(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function upload() {
    if (!selectedEventId) { setError('Bitte ein Event wählen'); return }
    if (!hasAnything) { setError('Fotos/Videos wählen, YouTube-Link oder Notiz hinzufügen'); return }
    setUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const tasks: Promise<Response>[] = []

      // 1) Files → one POST per file (each file its own item)
      if (files.length) {
        for (const file of files) {
          const isVideo = file.type.startsWith('video/')
          const fd = new FormData()
          fd.append('event_id', selectedEventId)
          fd.append('kind', isVideo ? 'video' : 'photo')
          fd.append('files', file)
          if (caption.trim()) fd.append('caption', caption.trim())
          tasks.push(fetch('/api/event-media', { method: 'POST', body: fd }))
        }
      }

      // 2) YouTube link
      if (youtubeUrl.trim()) {
        const ytId = extractYouTubeId(youtubeUrl)
        if (!ytId) throw new Error('Ungültiger YouTube-Link')
        const fd = new FormData()
        fd.append('event_id', selectedEventId)
        fd.append('kind', 'youtube')
        fd.append('youtube_url', youtubeWatchUrl(ytId))
        if (caption.trim()) fd.append('caption', caption.trim())
        tasks.push(fetch('/api/event-media', { method: 'POST', body: fd }))
      }

      // 3) Text note
      if (noteText.trim()) {
        const fd = new FormData()
        fd.append('event_id', selectedEventId)
        fd.append('kind', 'note')
        fd.append('caption', noteText.trim())
        tasks.push(fetch('/api/event-media', { method: 'POST', body: fd }))
      }

      const results = await Promise.all(tasks)
      const failed = results.filter(r => !r.ok)
      if (failed.length) {
        const detail = await failed[0].json().catch(() => null)
        throw new Error(detail?.error || `Upload fehlgeschlagen (${failed[0].status})`)
      }

      setSuccess('Gespeichert ♡')
      clearForm()
      onDone?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload fehlgeschlagen — nochmal versuchen')
    }
    setUploading(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-stone-800">Media hinzufügen ♡</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700 transition">✕</button>
        </div>

        {!preselectedEventId && (
          <div>
            <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Event</label>
            <select
              value={selectedEventId ?? ''}
              onChange={e => setSelectedEventId(e.target.value || null)}
              className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 bg-white"
            >
              <option value="">— wählen —</option>
              {eventsLoading && <option disabled>Laden…</option>}
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.title} · {fmtDate(ev.date)}</option>
              ))}
            </select>
          </div>
        )}

        {/* Photos / videos picker */}
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={e => { setFiles(Array.from(e.target.files ?? [])); setSuccess(null) }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-rose-200 hover:border-rose-300 rounded-2xl p-6 flex flex-col items-center gap-2 text-rose-400 hover:text-rose-500 transition"
          >
            <span className="text-3xl">🖼️</span>
            <span className="text-sm font-medium">Fotos & Videos auswählen</span>
            <span className="text-xs text-stone-400">mehrere gleichzeitig möglich</span>
          </button>
          {files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-stone-100 rounded-full px-3 py-1 text-xs text-stone-600">
                  {f.type.startsWith('video/') ? '🎬' : '📷'} <span className="max-w-[140px] truncate">{f.name}</span>
                  <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} className="text-stone-400 hover:text-stone-700">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* YouTube link */}
        <div>
          <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">YouTube-Link</label>
          <div className="mt-1 flex gap-2">
            <input
              value={youtubeUrl}
              onChange={e => { setYoutubeUrl(e.target.value); setSuccess(null) }}
              placeholder="https://youtube.com/watch?v=… oder youtu.be/…"
              className="flex-1 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
            {youtubeUrl && !extractYouTubeId(youtubeUrl) && (
              <span className="text-rose-400 text-xs self-center">⚠️ Link prüfen</span>
            )}
          </div>
        </div>

        {/* Text note */}
        <div>
          <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Notiz (optional)</label>
          <textarea
            value={noteText}
            onChange={e => { setNoteText(e.target.value); setSuccess(null) }}
            placeholder="Was war besonders an diesem Moment?"
            rows={2}
            className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 resize-none"
          />
        </div>

        {/* Caption applied to uploads */}
        <div>
          <label className="text-xs font-medium text-stone-500 uppercase tracking-wide">Beschriftung für Uploads (optional)</label>
          <input
            value={caption}
            onChange={e => setCaption(e.target.value)}
            placeholder="z.B. 'Sziget 2026 ♡'"
            className="mt-1 w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-emerald-500 text-sm">{success}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={upload}
            disabled={uploading || !selectedEventId || !hasAnything}
            className="flex-1 bg-gradient-to-r from-rose-400 to-pink-500 text-white py-3 rounded-xl font-medium hover:from-rose-500 hover:to-pink-600 transition disabled:opacity-40 shadow-sm"
          >
            {uploading ? 'Speichert…' : 'Speichern ♡'}
          </button>
        </div>
      </div>
    </div>
  )
}
