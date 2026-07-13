import { runDiscovery } from '@/lib/discovery'
import { NextRequest } from 'next/server'

// Daily Vercel cron. Scrapes Vienna sources → inserts fresh city suggestions.
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true // no secret set → allow (e.g. local dev)
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await runDiscovery()
    return Response.json({ ok: true, ...result })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'discovery failed'
    return Response.json({ ok: false, error: msg }, { status: 500 })
  }
}