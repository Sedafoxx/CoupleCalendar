'use client'
import { useEffect, useState } from 'react'

// Renders a real poster frame for a video by seeking a little way in and
// drawing to a canvas — avoids the black/empty <video> preview in feeds.
// If capture fails it shows a neutral tile with a play badge.

interface VideoPreviewProps {
  src: string
  className?: string
}

export default function VideoPreview({ src, className }: VideoPreviewProps) {
  const [frame, setFrame] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    video.src = src

    const capture = () => {
      if (cancelled) return
      try {
        const w = video.videoWidth || 640
        const h = video.videoHeight || 360
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('no ctx')
        ctx.drawImage(video, 0, 0, w, h)
        setFrame(canvas.toDataURL('image/jpeg', 0.72))
      } catch {
        // not ready yet — try again shortly
        setTimeout(capture, 120)
      }
    }

    const onLoaded = () => {
      if (cancelled) return
      try {
        const target = Math.min(video.duration > 1 ? 0.6 : 0, 1)
        if (target > 0) video.currentTime = target
        else capture()
      } catch {
        /* ignore */
      }
    }
    const onSeeked = () => { if (!cancelled) capture() }
    const onError = () => { if (!cancelled) setFailed(true) }

    video.addEventListener('loadeddata', onLoaded)
    video.addEventListener('canplay', onLoaded)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.load()

    return () => {
      cancelled = true
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('canplay', onLoaded)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      video.removeAttribute('src')
      video.load()
    }
  }, [src])

  return (
    <div className={`relative w-full h-full overflow-hidden bg-stone-900 ${className || ''}`}>
      {frame ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frame} alt="" className="w-full h-full object-cover" />
      ) : failed ? (
        <div className="w-full h-full bg-gradient-to-br from-stone-800 to-stone-900" />
      ) : null}

      {/* Play badge */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="flex items-center justify-center w-11 h-11 rounded-full bg-black/55 backdrop-blur-sm">
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-white ml-0.5" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>

      {/* Corner tag */}
      <span className="absolute top-2 right-2 text-[10px] font-semibold text-white bg-black/50 px-1.5 py-0.5 rounded">
        🎬 Video
      </span>
    </div>
  )
}
