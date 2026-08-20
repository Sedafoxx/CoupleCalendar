'use client'
import { useState, useRef } from 'react'
import type { Memory } from '@/lib/supabase'

interface Props {
  memory: Memory
  onClose: () => void
  onUpdated?: () => void
  /** Open the underlying event's edit dialog (title/date/location). */
  onEditEvent?: (eventId: string) => void
}

/** Compress an image File/Blob to max 1200px, JPEG quality 0.8 */
function compressImage(file: Blob, maxDim = 1200): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let w = img.width, h = img.height
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(img, 0, 0, w, h)
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8)
    }
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = url
  })
}

export default function MemoryEditor({ memory, onClose, onUpdated, onEditEvent }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [frontPreview, setFrontPreview] = useState<string | null>(null)
  const [backPreview, setBackPreview] = useState<string | null>(null)
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const frontRef = useRef<HTMLInputElement>(null)
  const backRef = useRef<HTMLInputElement>(null)

  // Delete the underlying event (memories cascade via DB FK). Lets you remove
  // a past confirmed event straight from its memory view.
  async function deleteEvent() {
    if (!memory.event_id) return
    if (!confirm('Really delete this event?')) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/events/${memory.event_id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Delete failed (${res.status})`)
      onClose()
      onUpdated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed — try again')
      setDeleting(false)
    }
  }

  const isNote = memory.photo_back.includes('note.gif')

  function handleReplace(type: 'front' | 'back', file: File) {
    const url = URL.createObjectURL(file)
    if (type === 'front') {
      setFrontPreview(url)
      setFrontFile(file)
    } else {
      setBackPreview(url)
      setBackFile(file)
    }
  }

  async function saveChanges() {
    if (!frontFile && !backFile) {
      setIsEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const formData = new FormData()
      if (frontFile) {
        const compressed = await compressImage(frontFile)
        formData.append('photo_front', compressed, frontFile.name)
      }
      if (backFile) {
        const compressed = await compressImage(backFile)
        formData.append('photo_back', compressed, backFile.name)
      }

      const res = await fetch(`/api/memories/${memory.id}`, {
        method: 'PATCH',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || `Upload failed (${res.status})`)
      }

      setIsEditing(false)
      setFrontPreview(null)
      setBackPreview(null)
      setFrontFile(null)
      setBackFile(null)
      onUpdated?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed — try again')
    }
    setSaving(false)
  }

  function cancelEdit() {
    setIsEditing(false)
    setFrontPreview(null)
    setBackPreview(null)
    setFrontFile(null)
    setBackFile(null)
    setError(null)
  }

  if (isNote) return null // Don't show editor for text notes

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-y-auto">
      <div className="h-dvh flex flex-col">
        {/* Back camera photo — 66% */}
        <div className="flex-[2] bg-stone-900 flex items-center justify-center relative min-h-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={backPreview || memory.photo_back} alt="" className="w-full h-full object-cover" />
          {!isEditing && (
            <button
              onClick={() => backRef.current?.click()}
              className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-3 py-1.5 rounded-full hover:bg-black/70 transition"
            >
              Change
            </button>
          )}
        </div>

        {/* Front camera photo — 34% */}
        <div className="flex-[1] bg-stone-800 relative min-h-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={frontPreview || memory.photo_front} alt="" className="w-full h-full object-cover opacity-90" />
          {!isEditing && (
            <button
              onClick={() => frontRef.current?.click()}
              className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-3 py-1.5 rounded-full hover:bg-black/70 transition"
            >
              Change
            </button>
          )}
        </div>

        {/* Hidden file inputs */}
        <input ref={frontRef} type="file" accept="image/*" className="hidden" onChange={e => {
          const f = e.target.files?.[0]
          if (f) { handleReplace('front', f); setIsEditing(true) }
        }} />
        <input ref={backRef} type="file" accept="image/*" className="hidden" onChange={e => {
          const f = e.target.files?.[0]
          if (f) { handleReplace('back', f); setIsEditing(true) }
        }} />

        {/* Bottom panel */}
        <div className="bg-white rounded-t-3xl p-6 relative z-10 space-y-3 shrink-0">
          {memory.caption && <p className="text-stone-700 text-sm">&ldquo;{memory.caption}&rdquo;</p>}
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {isEditing ? (
            <div className="flex gap-2">
              <button onClick={cancelEdit} disabled={saving} className="flex-1 border border-stone-200 py-2.5 rounded-xl text-sm text-stone-500 hover:bg-stone-50 transition disabled:opacity-40">Cancel</button>
              <button onClick={saveChanges} disabled={saving} className="flex-1 bg-rose-400 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-rose-500 transition disabled:opacity-40">{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          ) : (
            <>
              <button onClick={onClose} className="w-full border border-stone-200 py-2.5 rounded-xl text-sm text-stone-500 hover:bg-stone-50 transition">Back</button>
              {memory.event_id && onEditEvent && (
                <button
                  onClick={() => onEditEvent(memory.event_id!)}
                  className="w-full py-2.5 rounded-xl text-sm text-stone-700 bg-stone-100 hover:bg-stone-200 transition"
                >
                  ✏️ Edit event
                </button>
              )}
              {memory.event_id && (
                <button
                  onClick={deleteEvent}
                  disabled={deleting}
                  className="w-full py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-50 transition disabled:opacity-40"
                >
                  {deleting ? 'Deleting...' : '🗑️ Delete event'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
