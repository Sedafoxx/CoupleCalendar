import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { isTheresaAuthed } from '@/lib/theresa-auth'
import { NextRequest } from 'next/server'

/** Identify the caller: 'dimitri' (Google OAuth), 'theresa' (PIN cookie), or null. */
async function whoIs(req: NextRequest): Promise<'dimitri' | 'theresa' | null> {
  const session = await getServerSession(authOptions)
  if (session) return 'dimitri'
  if (isTheresaAuthed(req)) return 'theresa'
  return null
}

type ClientEvent = {
  at?: unknown
  path?: unknown
  action?: unknown
  detail?: unknown
  level?: unknown
}

/**
 * POST /api/log  { events: ClientEvent[] }
 *
 * Appends client activity to activity_logs. Fire-and-forget from the client.
 */
export async function POST(req: NextRequest) {
  try {
    const who = await whoIs(req)
    const body = (await req.json()) as { events?: unknown }
    const rawEvents = Array.isArray(body.events) ? (body.events as unknown[]) : []

    const userAgent = req.headers.get('user-agent') || undefined
    const rows = rawEvents
      .slice(-200)
      .map((e) => {
        const ev = (e ?? {}) as ClientEvent
        return {
          who,
          path: typeof ev.path === 'string' ? ev.path.slice(0, 300) : null,
          action: String(ev.action ?? 'unknown').slice(0, 100),
          detail: ev.detail && typeof ev.detail === 'object' ? ev.detail : null,
          user_agent: userAgent,
        }
      })

    if (rows.length) {
      const { error } = await supabase.from('activity_logs').insert(rows)
      if (error) {
        // Logging must never break the user — just report to server console.
        console.error('[log] insert failed:', error.message)
      }
    }
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[log] failed:', err)
    return Response.json({ ok: false })
  }
}
