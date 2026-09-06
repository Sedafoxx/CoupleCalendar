'use client'
import { useState, useCallback } from 'react'
import type { EventMedia } from '@/lib/supabase'
import { youtubeEmbedUrl, youtubeWatchUrl } from '@/lib/youtube'

// Full-screen swipeable viewer for an event's media items (photos/videos/
// youtube). Tap the sides / swipe to move; shows captions and a delete option.

interface MediaViewerProps {
  items: EventMedia[]
  /** Index of the item to start on */
  initialIndex?: number
  onClose: () => void
  onDelete?: (item: EventMedia) => void
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'gerade eben'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString('de-AT', { day: 'numeric', month: 'short' })
}

export default function MediaViewer({ items, initialIndex = 0, onClose, onDelete }: MediaViewerProps) {
  const [index, setIndex] = useState(Math.min(initialIndex, items.length - 1))
  const item = items[index]

  const go = useCallback((dir: number) => {
    setIndex(i => Math.min(items.length - 1, Math.max(0, i + dir)))
  }, [items.length])

  if (!item || items.length === 0) return null
  const isVideo = item.kind === 'video'
  const isYouTube = item.kind === 'youtube'

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm text-white/70">{index + 1} / {items.length}</span>
        <button onClick={onClose} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-sm">✕ Schließen</button>
      </div>

      {/* Center media area */}
      <div className="flex-1 flex items-center justify-center px-2 min-h-0 relative select-none">
        {/* Left / right tap zones */}
        <button onClick={() => go(-1)} disabled={index === 0} aria-label="Previous"
          className="absolute left-0 inset-y-0 w-16 z-10 flex items-center justify-start pl-2 text-white/60 text-3xl disabled:opacity-0">
          ‹
        </button>

        <div className="max-h-full max-w-full flex items-center justify-center">
          {isYouTube ? (
            <div className="w-full max-w-3xl">
              <div className="relative w-full overflow-hidden rounded-xl" style={{ aspectRatio: '16 / 9' }}>
                <iframe
                  src={youtubeEmbedUrl(item.youtube_url ?? '')}
                  title="YouTube video player"
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <a href={youtubeWatchUrl(item.youtube_url ?? '')} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-white/60 hover:text-white">Auf YouTube öffnen ↗</a>
            </div>
          ) : isVideo ? (
            <video src={item.url ?? undefined} controls autoPlay playsInline className="max-h-[70vh] max-w-full rounded-xl" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url ?? undefined} alt={item.caption ?? 'Foto'} className="max-h-[70vh] max-w-full object-contain rounded-xl" />
          )}
        </div>

        <button onClick={() => go(1)} disabled={index === items.length - 1} aria-label="Next"
          className="absolute right-0 inset-y-0 w-16 z-10 flex items-center justify-end pr-2 text-white/60 text-3xl disabled:opacity-0">
          ›
        </button>
      </div>

      {/* Bottom caption bar */}
      <div className="px-5 py-4 space-y-2 text-center">
        {item.caption && <p className="text-white/90 text-sm leading-relaxed">“{item.caption}”</p>}
        <p className="text-xs text-white/40">
          {item.added_by === 'dimitri' ? 'Dimitri' : 'Theresa'} · {timeAgo(item.created_at)}
        </p>
        {onDelete && (
          <button
            onClick={() => onDelete(item)}
            className="text-xs text-red-300 hover:text-red-400 transition"
          >
            🗑️ Löschen
          </button>
        )}
      </div>
    </div>
  )
}
