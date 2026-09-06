'use client'
import { useRef, useState } from 'react'
import type { Event, EventMedia } from '@/lib/supabase'
import MediaViewer from './MediaViewer'
import { youtubeThumbnail } from '@/lib/youtube'

// One card per event in the Memories feed: header (title/date) + a swipeable
// gallery of its media + any text notes. Tapping a media item opens the
// full-screen viewer. Items ordered newest-first for a nicer browsing feel.

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-AT', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  })
}

interface EventMemoryCardProps {
  event: Event
  media: EventMedia[]
  onEditEvent?: (ev: Event) => void
  onDeleteItem?: (item: EventMedia) => void
  onAddMedia?: (ev: Event) => void
  onUpdated?: () => void
}

export default function EventMemoryCard({ event, media, onEditEvent, onDeleteItem, onAddMedia }: EventMemoryCardProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  // Gallery items = photos, videos, youtube links (newest first). Notes shown separately.
  const gallery = media.filter(m => m.kind !== 'note')
  const notes = media.filter(m => m.kind === 'note')

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <button
        onClick={() => onEditEvent?.(event)}
        className="w-full text-left px-4 py-3 hover:bg-stone-50 transition flex items-start justify-between gap-2"
      >
        <div className="min-w-0">
          <p className="font-semibold text-stone-800 truncate">{event.title}</p>
          <p className="text-xs text-stone-400 mt-0.5">
            {fmtDate(event.date)}{event.start_time ? ` · ${event.start_time.slice(0, 5)}` : ''}
            {gallery.length > 0 && <span className="ml-1.5 text-rose-300">· {gallery.length} {gallery.length === 1 ? 'Medium' : 'Medien'}</span>}
          </p>
        </div>
        {onEditEvent && <span className="text-xs text-stone-300 hover:text-rose-500 transition shrink-0 mt-0.5">✏️</span>}
      </button>

      {/* Gallery */}
      {gallery.length > 0 && (
        <div className="relative">
          <div
            ref={scrollRef}
            className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {gallery.map((m, i) => (
              <button
                key={m.id}
                onClick={() => setViewerIndex(i)}
                className="relative shrink-0 snap-center w-full aspect-[4/3] sm:aspect-[16/10] bg-black overflow-hidden group"
              >
                {m.kind === 'youtube' ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={youtubeThumbnail(m.youtube_url ?? '')}
                      alt="YouTube video"
                      className="w-full h-full object-contain bg-black"
                    />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-12 h-12 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
                        <svg viewBox="0 0 24 24" className="w-6 h-6 text-rose-500 ml-0.5" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      </span>
                    </span>
                  </>
                ) : m.kind === 'video' ? (
                  <video src={m.url ?? undefined} muted playsInline preload="metadata" className="w-full h-full object-contain bg-black" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url ?? undefined} alt={m.caption ?? event.title} className="w-full h-full object-cover" loading="lazy" />
                )}
                {/* kind badge */}
                <span className="absolute top-2 right-2 text-[10px] font-semibold text-white bg-black/50 px-1.5 py-0.5 rounded">
                  {m.kind === 'youtube' ? '▶ YouTube' : m.kind === 'video' ? '🎬 Video' : '📷'}
                </span>
              </button>
            ))}
          </div>
          {/* Dots */}
          {gallery.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {gallery.map((_, i) => (
                <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === viewerIndex ? 'bg-white' : 'bg-white/40'}`} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {notes.map(n => (
        <div key={n.id} className="px-4 py-3 border-t border-stone-100 bg-amber-50/40">
          <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">“{n.caption}”</p>
          <p className="text-xs text-stone-400 mt-1">📝 Notiz · {n.added_by === 'dimitri' ? 'Dimitri' : 'Theresa'}</p>
        </div>
      ))}

      {/* Empty state: a past confirmed event with no media yet */}
      {gallery.length === 0 && notes.length === 0 && onAddMedia && (
        <button onClick={() => onAddMedia(event)} className="w-full px-4 py-6 flex flex-col items-center gap-1 text-stone-300 hover:text-rose-400 hover:bg-rose-50/40 transition">
          <span className="text-3xl">➕</span>
          <span className="text-xs">Fotos / Videos / Notiz hinzufügen</span>
        </button>
      )}

      {/* Full-screen viewer */}
      {viewerIndex !== null && gallery.length > 0 && (
        <MediaViewer
          items={gallery}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onDelete={onDeleteItem}
        />
      )}
    </div>
  )
}
