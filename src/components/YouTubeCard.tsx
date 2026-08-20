'use client'
import { useState } from 'react'
import { extractYouTubeId, youtubeThumbnail, youtubeEmbedUrl, youtubeWatchUrl } from '@/lib/youtube'

// Renders a pretty YouTube thumbnail with a play button when the given text
// (memory caption / note) contains a YouTube link. Clicking the thumbnail opens
// a playable modal with the embedded video, plus a link to open it on YouTube.
// Returns null when no YouTube link is present, so callers can fall back to the
// normal caption rendering.

interface YouTubeCardProps {
  text: string | null | undefined
  /** Compact preview for cards in a feed (smaller thumbnail, inline). */
  compact?: boolean
}

export default function YouTubeCard({ text, compact = false }: YouTubeCardProps) {
  const [open, setOpen] = useState(false)
  const id = extractYouTubeId(text)
  if (!id) return null

  const thumb = youtubeThumbnail(id)

  return (
    <>
      {/* Thumbnail preview with play button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`relative block w-full overflow-hidden rounded-xl group ${compact ? '' : 'shadow-sm'}`}
        style={{ aspectRatio: '16 / 9' }}
        aria-label="Play YouTube video"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumb}
          alt="Video thumbnail"
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover transition duration-300 group-hover:scale-105"
        />
        {/* Play button */}
        <span className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/35 transition">
          <span className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/95 shadow-lg group-hover:scale-110 transition">
            <svg viewBox="0 0 24 24" className="w-6 h-6 sm:w-7 sm:h-7 text-rose-500 ml-0.5" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
        {/* Corner tag */}
        <span className="absolute bottom-1.5 right-2 text-[10px] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded">
          ▶ YouTube
        </span>
      </button>

      {/* Playable modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <a
                href={youtubeWatchUrl(id)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/80 hover:text-white transition inline-flex items-center gap-1.5"
              >
                ▶ Open on YouTube
              </a>
              <button
                onClick={() => setOpen(false)}
                className="text-white/80 hover:text-white transition text-sm px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20"
              >
                ✕ Close
              </button>
            </div>

            {/* 16:9 embed */}
            <div className="relative w-full overflow-hidden rounded-2xl bg-black shadow-2xl" style={{ aspectRatio: '16 / 9' }}>
              <iframe
                src={youtubeEmbedUrl(id, true)}
                title="YouTube video player"
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
