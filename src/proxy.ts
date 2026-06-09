import { NextRequest, NextResponse } from 'next/server'

export async function proxy(_req: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [],
}
