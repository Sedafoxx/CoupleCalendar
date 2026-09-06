'use client'

// Lightweight client-side activity logger.
//
// Everything funneled through track() is:
//   1) kept in a local ring buffer (for the "report a bug" context snapshot), and
//   2) POSTed to /api/log so it lands in Supabase activity_logs for later analysis.
//
// Posting is fire-and-forget + coalesced so it never blocks the UI or spams the
// network.

export type ActivityEvent = {
  at: string          // ISO timestamp
  path: string
  action: string
  detail?: Record<string, unknown>
  level?: 'info' | 'warn' | 'error'
}

const RING_MAX = 200
let ring: ActivityEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

// Try to keep recent activity across reloads (for better bug-report context).
const LS_KEY = 'activity_log'
function loadFromStorage(): ActivityEvent[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? (JSON.parse(raw) as ActivityEvent[]) : []
    return Array.isArray(parsed) ? parsed.slice(-RING_MAX) : []
  } catch {
    return []
  }
}
function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(ring.slice(-RING_MAX)))
  } catch { /* storage full / unavailable */ }
}

/** Retrieve a snapshot of the most recent activity (for bug reports). */
export function getRecentActivity(limit = 80): ActivityEvent[] {
  return ring.slice(-limit)
}

/** Manually seed the ring from persisted logs (call once on boot). */
export function seedActivity(): void {
  if (ring.length) return
  ring = loadFromStorage()
}

/** Send a batch to the server. */
function flush() {
  flushTimer = null
  if (ring.length === 0) return
  const batch = ring
  ring = []
  persist()
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: batch }),
    keepalive: true,
  }).catch(() => {})
}

function scheduleFlush() {
  if (flushTimer) return
  // Flush quickly (2s) so data isn't lost if the user closes the tab.
  flushTimer = setTimeout(flush, 2000)
}

/** Record an activity event. Call from components after user actions / errors. */
export function track(
  action: string,
  detail?: Record<string, unknown>,
  level: ActivityEvent['level'] = 'info',
) {
  try {
    const path =
      typeof window !== 'undefined'
        ? window.location.pathname + window.location.search
        : ''
    const ev: ActivityEvent = {
      at: new Date().toISOString(),
      path,
      action,
      detail,
      level,
    }
    ring.push(ev)
    if (ring.length > RING_MAX * 2) ring = ring.slice(-RING_MAX)
    scheduleFlush()
  } catch {
    // never let logging break the app
  }
}
