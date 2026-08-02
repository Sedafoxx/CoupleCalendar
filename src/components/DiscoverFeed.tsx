'use client'
import { useMemo, useState } from 'react'
import type { Event } from '@/lib/supabase'
import RsvpButtons from './RsvpButtons'
import ProvenanceBadge from './ProvenanceBadge'
import { provenanceOf, provenanceRank } from '@/lib/event-utils'

const SOURCE_LABELS: Record<string, string> = {
  ra: 'RA',
  gogogo: 'Kino am Dach',
  yesticket: 'ViennaImprov',
}

const TAGS = ['romantic', 'adventure', 'food', 'culture', 'outdoor', 'sport']

function fmtTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

function fmtDay(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-AT', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

interface DiscoverFeedProps {
  events: Event[]
  who: 'dimitri' | 'theresa' | null
  onSelectEvent: (ev: Event) => void
  onUpdated: () => void
}

// Browsable feed of scraped Vienna events (category = 'city') with filters,
// external links and the shared RSVP → confirm → Google Calendar flow.
export default function DiscoverFeed({ events, who, onSelectEvent, onUpdated }: DiscoverFeedProps) {
  const [tag, setTag] = useState<string | null>(null)
  const [source, setSource] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const sources = useMemo(
    () => Array.from(new Set(events.filter(e => e.category === 'city').map(e => e.source).filter((s): s is string => !!s))),
    [events],
  )

  // Priority: the couple's own (manually added) events first, then events either
  // partner has engaged with (RSVP), then by date.
  const engaged = (e: Event) =>
    e.rsvp_dimitri === 'going' || e.rsvp_theresa === 'going' || e.rsvp_dimitri === 'interested' || e.rsvp_theresa === 'interested'
      ? 0
      : 1

  const filtered = useMemo(() => {
    return events
      .filter(e => e.category === 'city')
      .filter(e => e.date >= today)
      .filter(e => !tag || (e.tags ?? []).includes(tag))
      .filter(e => !source || e.source === source)
      .sort((a, b) =>
        (provenanceRank(provenanceOf(a)) - provenanceRank(provenanceOf(b))) ||
        (engaged(a) - engaged(b)) ||
        a.date.localeCompare(b.date) ||
        (a.start_time ?? '').localeCompare(b.start_time ?? '')
      )
  }, [events, tag, source, today])

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={source ?? ''}
          onChange={e => setSource(e.target.value || null)}
          className="text-xs border border-stone-200 rounded-xl px-2.5 py-1.5 bg-white text-stone-600 focus:outline-none focus:ring-2 focus:ring-rose-200"
        >
          <option value="">Alle Quellen</option>
          {sources.map(s => (
            <option key={s} value={s}>{SOURCE_LABELS[s] ?? s}</option>
          ))}
        </select>
        {TAGS.map(t => (
          <button
            key={t}
            onClick={() => setTag(tag === t ? null : t)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium transition ${
              tag === t ? 'bg-rose-500 text-white' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-stone-400 text-sm text-center py-10">
          Keine Events gefunden — probier andere Filter ♡
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map(ev => (
            <div
              key={ev.id}
              onClick={() => onSelectEvent(ev)}
              className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-rose-200 transition cursor-pointer"
            >
              <div className="flex gap-3 p-3">
                <div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-stone-100">
                  {ev.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ev.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🎟️</div>
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ProvenanceBadge event={ev} />
                    <span className="text-[10px] uppercase tracking-wide text-stone-400 font-medium">
                      {SOURCE_LABELS[ev.source ?? ''] ?? ev.source}
                    </span>
                    {(ev.tags ?? []).map(t => (
                      <span key={t} className="text-[10px] bg-rose-50 text-rose-400 px-1.5 py-0.5 rounded-full">{t}</span>
                    ))}
                  </div>
                  <p className="font-medium text-sm text-stone-800 leading-snug">{ev.title}</p>
                  <p className="text-xs text-stone-500 truncate">{ev.location}</p>
                  <p className="text-xs text-stone-400">
                    {fmtDay(ev.date)}
                    {ev.start_time ? ` · ${fmtTime(ev.start_time)}${ev.end_time ? `–${fmtTime(ev.end_time)}` : ''} Uhr` : ''}
                  </p>
                </div>
              </div>

              <div className="px-3 pb-3 flex items-center justify-between gap-2">
                <div onClick={e => e.stopPropagation()}>
                  <RsvpButtons event={ev} who={who} onUpdated={onUpdated} />
                </div>
                {ev.url && (
                  <a
                    href={ev.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-rose-400 hover:text-rose-600 underline shrink-0"
                  >
                    Mehr Infos ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
