import { getToken } from 'next-auth/jwt'
import { NextRequest, NextResponse } from 'next/server'

export async function proxy(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  if (!token && req.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/api/auth/signin', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/'],
}
