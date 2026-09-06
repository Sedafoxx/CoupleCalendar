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

/**
 * POST /api/bug-report
 * Body: { message: string, context?: ActivityEvent[] }
 * Saves a bug report with a snapshot of recent client activity so it can be
 * reproduced & analyzed.
 */
export async function POST(req: NextRequest) {
  try {
    const who = await whoIs(req)
    const body = (await req.json()) as {
      message?: unknown
      context?: unknown
      path?: unknown
    }
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!message) {
      return Response.json({ error: 'message is required' }, { status: 400 })
    }

    const context = Array.isArray(body.context)
      ? (body.context as unknown[]).slice(-200)
      : null

    const { data, error } = await supabase
      .from('bug_reports')
      .insert({
        who,
        path: typeof body.path === 'string' ? body.path.slice(0, 300) : null,
        message: message.slice(0, 4000),
        context,
      })
      .select()
      .single()

    if (error) {
      console.error('[bug-report] insert failed:', error.message)
      return Response.json({ ok: false, error: error.message }, { status: 500 })
    }

    // Also log the submission into activity_logs for the timeline.
    await supabase.from('activity_logs').insert({
      who,
      path: typeof body.path === 'string' ? body.path.slice(0, 300) : null,
      action: 'bug_report',
      detail: { id: data.id, message: message.slice(0, 200) },
    })

    return Response.json({ ok: true, id: data.id })
  } catch (err) {
    console.error('[bug-report] failed:', err)
    return Response.json({ ok: false })
  }
}
