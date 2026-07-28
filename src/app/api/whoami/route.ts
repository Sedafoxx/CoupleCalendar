import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isTheresaAuthed } from '@/lib/theresa-auth'
import { NextRequest } from 'next/server'

/**
 * Returns who's currently authenticated.
 * GET /api/whoami → { user: 'dimitri' | 'theresa' | null }
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (session) return Response.json({ user: 'dimitri' })
  if (isTheresaAuthed(req)) return Response.json({ user: 'theresa' })
  return Response.json({ user: null })
}
