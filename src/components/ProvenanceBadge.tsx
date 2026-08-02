'use client'
import type { Event } from '@/lib/supabase'
import { provenanceOf, PROVENANCE_LABEL, type Provenance } from '@/lib/event-utils'

const TONES: Record<Provenance, string> = {
  dimi: 'bg-stone-900 text-white',
  theresa: 'bg-rose-400 text-white',
  agent: 'bg-sky-100 text-sky-600',
  manual: 'bg-amber-100 text-amber-700',
}

// Small pill showing who added an event: Dimi / Theresa / 🤖 Agent (scraped).
export default function ProvenanceBadge({ event, className }: { event: Event; className?: string }) {
  const p = provenanceOf(event)
  return (
    <span
      className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${TONES[p]} ${className ?? ''}`}
    >
      {p === 'agent' ? '🤖 Agent' : PROVENANCE_LABEL[p]}
    </span>
  )
}
