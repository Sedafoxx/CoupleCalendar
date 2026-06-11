import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  if (req.cookies.get('theresa_auth')?.value === '1') {
    return Response.json({ ok: true })
  }
  return Response.json({ error: 'Not authenticated' }, { status: 401 })
}

export async function POST(req: NextRequest) {
  const { pin } = await req.json()
  if (!pin || pin !== process.env.THERESA_PIN) {
    return Response.json({ error: 'Wrong PIN' }, { status: 401 })
  }
  const res = Response.json({ ok: true })
  res.headers.set('Set-Cookie', 'theresa_auth=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000')
  return res
}
