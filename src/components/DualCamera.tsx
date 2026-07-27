'use client'
import { useRef, useState, useCallback, useEffect } from 'react'
import type { Memory } from '@/lib/supabase'
import type { Event } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────
type CaptureState = 'idle' | 'countdown' | 'capturing' | 'preview' | 'uploading'

interface DualCameraProps {
  /** Called after a memory is successfully saved */
  onSaved?: (memory: Memory) => void
  /** Called to close/dismiss the camera */
  onClose?: () => void
  /** Pre-selected event (optional — user can pick one) */
  preselectedEventId?: string
}

// ── Helpers ────────────────────────────────────────────────
function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-AT', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.92)
  })
}

// ── Component ──────────────────────────────────────────────
export default function DualCamera({ onSaved, onClose, preselectedEventId }: DualCameraProps) {
  const [state, setState] = useState<CaptureState>('idle')
  const [countdown, setCountdown] = useState(3)
  const [frontPreview, setFrontPreview] = useState<string | null>(null)
  const [backPreview, setBackPreview] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'camera' | 'gallery'>('camera')

  // Gallery upload refs
  const galleryBackRef = useRef<HTMLInputElement>(null)
  const galleryFrontRef = useRef<HTMLInputElement>(null)

  // Event selection
  const [events, setEvents] = useState<Event[]>([])
  const [selectedEventId, setSelectedEventId] = useState<string | null>(preselectedEventId ?? null)
  const [eventsLoading, setEventsLoading] = useState(true)

  // Camera refs
  const frontVideoRef = useRef<HTMLVideoElement>(null)
  const backVideoRef = useRef<HTMLVideoElement>(null)
  const frontCanvasRef = useRef<HTMLCanvasElement>(null)
  const backCanvasRef = useRef<HTMLCanvasElement>(null)
  const frontStreamRef = useRef<MediaStream | null>(null)
  const backStreamRef = useRef<MediaStream | null>(null)

  // Fetch events for the event picker (include past events so you can attach photos to old memories)
  useEffect(() => {
    fetch('/api/events?past=true')
      .then((r) => r.json())
      .then((data) => {
        setEvents(Array.isArray(data) ? data : [])
        setEventsLoading(false)
      })
      .catch(() => setEventsLoading(false))
  }, [])

  // Start cameras
  const startCameras = useCallback(async () => {
    try {
      // Rear camera (main view)
      const backStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      // Front camera (selfie PiP)
      const frontStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })

      backStreamRef.current = backStream
      frontStreamRef.current = frontStream

      if (backVideoRef.current) backVideoRef.current.srcObject = backStream
      if (frontVideoRef.current) frontVideoRef.current.srcObject = frontStream
    } catch {
      setError('Camera access denied. Please allow camera permissions.')
    }
  }, [])

  // Cleanup cameras on unmount
  useEffect(() => {
    startCameras()
    return () => {
      backStreamRef.current?.getTracks().forEach((t) => t.stop())
      frontStreamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [startCameras])

  // Countdown + capture
  const startCapture = useCallback(() => {
    setState('countdown')
    setCountdown(3)

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          captureFrames()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  const captureFrames = useCallback(() => {
    setState('capturing')

    const frontVideo = frontVideoRef.current
    const backVideo = backVideoRef.current
    const frontCanvas = frontCanvasRef.current
    const backCanvas = backCanvasRef.current

    if (!frontVideo || !backVideo || !frontCanvas || !backCanvas) {
      setError('Camera not ready')
      setState('idle')
      return
    }

    // Draw back camera frame
    backCanvas.width = backVideo.videoWidth
    backCanvas.height = backVideo.videoHeight
    const backCtx = backCanvas.getContext('2d')
    backCtx?.drawImage(backVideo, 0, 0)

    // Draw front camera frame (mirrored for selfie feel)
    frontCanvas.width = frontVideo.videoWidth
    frontCanvas.height = frontVideo.videoHeight
    const frontCtx = frontCanvas.getContext('2d')
    if (frontCtx) {
      // Mirror the front camera image
      frontCtx.translate(frontCanvas.width, 0)
      frontCtx.scale(-1, 1)
      frontCtx.drawImage(frontVideo, 0, 0)
    }

    // Create preview URLs
    setBackPreview(backCanvas.toDataURL('image/jpeg', 0.92))
    setFrontPreview(frontCanvas.toDataURL('image/jpeg', 0.92))
    setState('preview')
  }, [])

  // Retake
  const retake = useCallback(() => {
    setFrontPreview(null)
    setBackPreview(null)
    setCaption('')
    setError(null)
    setState('idle')
    // Clear gallery files
    delete (window as unknown as Record<string, unknown>).__galleryFrontFile
    delete (window as unknown as Record<string, unknown>).__galleryBackFile
  }, [])

  // Save memory
  const saveMemory = useCallback(async () => {
    if (!selectedEventId || !frontPreview || !backPreview) {
      setError('Please select an event')
      return
    }

    setState('uploading')
    setError(null)

    try {
      // Use gallery files if available, otherwise convert canvas data URLs
      const galleryFrontFile = (window as unknown as Record<string, unknown>).__galleryFrontFile as File | undefined
      const galleryBackFile = (window as unknown as Record<string, unknown>).__galleryBackFile as File | undefined

      const frontBlob = galleryFrontFile || await (await fetch(frontPreview)).blob()
      const backBlob = galleryBackFile || await (await fetch(backPreview)).blob()

      // Build form data
      const formData = new FormData()
      formData.append('photo_front', frontBlob, 'selfie.jpg')
      formData.append('photo_back', backBlob, 'memory.jpg')
      formData.append('event_id', selectedEventId)
      if (caption.trim()) formData.append('caption', caption.trim())

      const res = await fetch('/api/memories', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Upload failed')
      }

      const memory: Memory = await res.json()
      onSaved?.(memory)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save memory')
      setState('preview')
    }
  }, [selectedEventId, frontPreview, backPreview, caption, onSaved])

  // ── Render ──────────────────────────────────────────────

  // Camera view (idle / countdown / capturing)
  if (state === 'idle' || state === 'countdown' || state === 'capturing') {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        {/* Rear camera — full screen */}
        <video
          ref={backVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Front camera — PiP overlay (top-right, like BeReal) */}
        <div className="absolute top-4 right-4 w-28 h-36 rounded-2xl overflow-hidden border-2 border-white/60 shadow-lg">
          <video
            ref={frontVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/40 text-white flex items-center justify-center text-lg z-10"
        >
          ✕
        </button>

        {/* Countdown overlay */}
        {state === 'countdown' && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <span className="text-white text-8xl font-bold animate-ping">
              {countdown}
            </span>
          </div>
        )}

        {/* Mode switch + shutter/gallery buttons */}
        {state === 'idle' && (
          <div className="absolute bottom-8 inset-x-0 z-10 flex flex-col items-center gap-4">
            {/* Mode toggle */}
            <div className="flex gap-2 bg-black/40 rounded-full p-1">
              <button
                onClick={() => setMode('camera')}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${
                  mode === 'camera' ? 'bg-white text-black' : 'text-white/70'
                }`}
              >
                📸 Camera
              </button>
              <button
                onClick={() => setMode('gallery')}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${
                  mode === 'gallery' ? 'bg-white text-black' : 'text-white/70'
                }`}
              >
                🖼️ Gallery
              </button>
            </div>

            {mode === 'camera' ? (
              <button
                onClick={startCapture}
                className="w-20 h-20 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 transition flex items-center justify-center"
              >
                <div className="w-16 h-16 rounded-full bg-white" />
              </button>
            ) : (
              <div className="flex gap-4">
                <button
                  onClick={() => galleryBackRef.current?.click()}
                  className="flex flex-col items-center gap-1 px-6 py-3 rounded-2xl bg-white/20 hover:bg-white/30 transition"
                >
                  <span className="text-2xl">🖼️</span>
                  <span className="text-white text-xs">Main photo</span>
                </button>
                <button
                  onClick={() => galleryFrontRef.current?.click()}
                  className="flex flex-col items-center gap-1 px-6 py-3 rounded-2xl bg-white/20 hover:bg-white/30 transition"
                >
                  <span className="text-2xl">🤳</span>
                  <span className="text-white text-xs">Selfie</span>
                </button>
              </div>
            )}

            {/* Hidden file inputs for gallery */}
            <input
              ref={galleryBackRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const url = URL.createObjectURL(file)
                setBackPreview(url)
                // Store the file for later upload
                ;(window as unknown as Record<string, unknown>).__galleryBackFile = file
                e.target.value = ''
                // If both photos are selected, go to preview
                if (frontPreview) setState('preview')
              }}
            />
            <input
              ref={galleryFrontRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const url = URL.createObjectURL(file)
                setFrontPreview(url)
                ;(window as unknown as Record<string, unknown>).__galleryFrontFile = file
                e.target.value = ''
                if (backPreview) setState('preview')
              }}
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="absolute bottom-28 inset-x-4 z-10 bg-red-500 text-white text-sm px-4 py-3 rounded-xl text-center">
            {error}
          </div>
        )}

        {/* Hidden canvases for capture */}
        <canvas ref={backCanvasRef} className="hidden" />
        <canvas ref={frontCanvasRef} className="hidden" />
      </div>
    )
  }

  // Preview / upload view
  if (state === 'preview' || state === 'uploading') {
    return (
      <div className="fixed inset-0 z-50 bg-black overflow-y-auto">
        <div className="min-h-full flex flex-col">
          {/* Photo preview — BeReal split layout */}
          <div className="flex-1 flex flex-col">
            {/* Back camera (main scene) — top 70% */}
            <div className="relative flex-1 bg-stone-900 flex items-center justify-center min-h-[50vh]">
              {backPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={backPreview}
                  alt="Memory"
                  className="w-full h-full object-cover"
                />
              )}
            </div>

            {/* Front camera (selfie) — bottom 30% with overlay feel */}
            <div className="relative h-[25vh] bg-stone-800 flex items-center justify-center">
              {frontPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={frontPreview}
                  alt="Selfie"
                  className="h-full w-full object-cover opacity-90"
                />
              )}
              {/* Divider line with camera icon */}
              <div className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 -translate-y-1/2">
                <div className="flex-1 h-px bg-white/30" />
                <span className="text-white/60 text-xs bg-stone-800 px-3 py-1 rounded-full">
                  📸 Dual Capture
                </span>
                <div className="flex-1 h-px bg-white/30" />
              </div>
            </div>
          </div>

          {/* Controls panel */}
          <div className="bg-white rounded-t-3xl p-6 space-y-4 -mt-4 relative z-10">
            {/* Event picker */}
            <div className="space-y-1.5">
              <label className="text-xs text-stone-400 uppercase tracking-widest font-medium">
                Attach to Event
              </label>
              {eventsLoading ? (
                <p className="text-sm text-stone-400">Loading events...</p>
              ) : (
                <select
                  value={selectedEventId ?? ''}
                  onChange={(e) => setSelectedEventId(e.target.value || null)}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 bg-white"
                >
                  <option value="">Select an event...</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {fmtDate(ev.date)} — {ev.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Caption */}
            <div className="space-y-1.5">
              <label className="text-xs text-stone-400 uppercase tracking-widest font-medium">
                Caption
              </label>
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="How was it? ♡"
                className="w-full border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                maxLength={280}
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-500 text-center">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={retake}
                disabled={state === 'uploading'}
                className="flex-1 border border-stone-200 py-3 rounded-xl text-sm text-stone-500 hover:bg-stone-50 transition disabled:opacity-40"
              >
                Retake
              </button>
              <button
                onClick={saveMemory}
                disabled={state === 'uploading' || !selectedEventId}
                className="flex-1 bg-gradient-to-r from-rose-400 to-pink-500 text-white py-3 rounded-xl text-sm font-medium hover:from-rose-500 hover:to-pink-600 transition disabled:opacity-40 shadow-sm"
              >
                {state === 'uploading' ? 'Saving... ♡' : 'Save Memory ♡'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
