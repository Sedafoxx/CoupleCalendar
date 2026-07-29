'use client'
import type { Memory } from '@/lib/supabase'
import type { Event } from '@/lib/supabase'

// ── Helpers ────────────────────────────────────────────────
function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-AT', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ── Props ──────────────────────────────────────────────────
interface MemoryCardProps {
  memory: Memory & { event_title?: string; event_date?: string }
  onClick?: () => void
}

// ── Component ──────────────────────────────────────────────
export default function MemoryCard({ memory, onClick }: MemoryCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition"
    >
      {/* BeReal-style split photo */}
      <div className="flex h-48 sm:h-64">
        {/* Back camera (main scene) — 66% */}
        <div className="flex-[2] relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={memory.photo_back}
            alt="Memory"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Front camera (selfie) — 34% */}
        <div className="flex-[1] relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={memory.photo_front}
            alt="Selfie"
            className="w-full h-full object-cover opacity-85"
          />
          {/* Selfie label */}
          <div className="absolute top-2 left-1/2 -translate-x-1/2">
            <span className="text-[10px] text-white bg-black/40 px-2 py-0.5 rounded-full">
              selfie
            </span>
          </div>
        </div>
      </div>

      {/* Info footer */}
      <div className="px-4 py-3 space-y-1">
        {/* Event title + date */}
        <div className="flex items-center gap-2">
          {memory.event_title && (
            <span className="font-semibold text-sm text-stone-800 truncate">
              {memory.event_title}
            </span>
          )}
          {memory.event_date && (
            <span className="text-xs text-stone-400 shrink-0">
              {fmtDate(memory.event_date)}
            </span>
          )}
        </div>

        {/* Caption */}
        {memory.caption && (
          <p className="text-sm text-stone-600 leading-relaxed">
            &ldquo;{memory.caption}&rdquo;
          </p>
        )}

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-stone-400 pt-0.5">
          <span>
            {memory.captured_by === 'dimitri' ? 'Dimitri' : 'Theresa'} ♡
          </span>
          <span>{timeAgo(memory.created_at)}</span>
        </div>
      </div>
    </button>
  )
}
