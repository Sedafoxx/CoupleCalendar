'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { track, getRecentActivity, seedActivity } from '@/lib/activity'
import type { ActivityEvent } from '@/lib/activity'

// Floating "report a bug" button. Opens a small modal where the user describes
// the problem; the report automatically includes a snapshot of recent activity
// (page views, actions, errors) so issues can be reproduced & analyzed later.

export default function BugReporter() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<ActivityEvent[]>([])

  useEffect(() => {
    seedActivity()
  }, [])

  function openModal() {
    setMessage('')
    setError(null)
    setDone(false)
    setSnapshot(getRecentActivity(80))
    setOpen(true)
  }

  async function submit() {
    if (!message.trim()) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          path: pathname,
          context: snapshot,
        }),
      })
      if (!res.ok) throw new Error('Send failed')
      track('bug_report_sent', { path: pathname })
      setDone(true)
      setMessage('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send report')
      track('bug_report_failed', {}, 'error')
    }
    setSending(false)
  }

  return (
    <>
      {/* Floating button (bottom-left, above the nav) */}
      <button
        onClick={openModal}
        aria-label="Report a bug"
        title="Report a bug"
        className="fixed bottom-24 left-4 z-30 w-11 h-11 rounded-full bg-stone-900 text-white shadow-lg flex items-center justify-center text-lg hover:bg-stone-700 transition active:scale-95"
      >
        🐞
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-stone-800">🐞 Bug melden</h2>
              <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700 transition">✕</button>
            </div>

            {done ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-4xl">🙏</p>
                <p className="text-stone-700 font-medium">Danke! Report gespeichert.</p>
                <p className="text-stone-400 text-sm">Die letzten Aktivitäten wurden mitgeschickt.</p>
                <button
                  onClick={() => setOpen(false)}
                  className="mt-2 bg-stone-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-700 transition"
                >
                  Schließen
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-stone-500">
                  Was ist passiert? Beschreibe kurz, was du getan hast und was nicht
                  funktioniert hat. Dein Report enthält automatisch die letzten
                  Aktivitäten als Kontext.
                </p>

                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={5}
                  autoFocus
                  placeholder="z.B. 'Video hinzugefügt, aber das Thumbnail war schwarz…'"
                  className="w-full border border-stone-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 resize-none"
                />

                {snapshot.length > 0 && (
                  <details className="text-xs text-stone-400">
                    <summary className="cursor-pointer hover:text-stone-600 transition">
                      {snapshot.length} letzte Aktivitäten ansehen
                    </summary>
                    <div className="mt-2 max-h-40 overflow-y-auto bg-stone-50 rounded-xl p-2 font-mono space-y-1">
                      {snapshot.slice(-30).map((ev, i) => (
                        <div key={i} className="truncate">
                          <span className="text-stone-300">{ev.at.slice(11, 19)}</span>{' '}
                          <span className="text-stone-500">{ev.action}</span>{' '}
                          <span className="text-stone-400">{ev.path}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="flex-1 border border-stone-200 py-2.5 rounded-xl text-sm text-stone-500 hover:bg-stone-50 transition"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={submit}
                    disabled={sending || !message.trim()}
                    className="flex-1 bg-gradient-to-r from-rose-400 to-pink-500 text-white py-2.5 rounded-xl text-sm font-medium hover:from-rose-500 hover:to-pink-600 transition disabled:opacity-40"
                  >
                    {sending ? 'Sende…' : 'Senden ♡'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
