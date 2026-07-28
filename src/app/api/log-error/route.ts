import { NextRequest } from 'next/server'

/**
 * Client-side error logger.
 * POST /api/log-error  { message, stack, url }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.error('[client-error]', body.url || '', body.message || '')
    if (body.stack) console.error(body.stack)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false })
  }
}
