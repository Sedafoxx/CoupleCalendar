import { NextRequest } from 'next/server'

export function isTheresaAuthed(req: NextRequest): boolean {
  return req.cookies.get('theresa_auth')?.value === '1'
}
