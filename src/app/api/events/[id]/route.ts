import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { isTheresaAuthed } from '@/lib/theresa-auth'
import type { NextRequest } from 'next/server'

async function isAuthed(req: NextRequest): Promise<boolean> {
  const session = await getServerSession(authOptions)
  return !!session || isTheresaAuthed(req)
}

export async function DELETE(
  req: NextRequest,
  ctx: RouteContext<'/api/events/[id]'>
) {
  if (!await isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const { error } = await supabase.from('events').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return new Response(null, { status: 204 })
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<'/api/events/[id]'>
) {
  if (!await isAuthed(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json()

  const { data, error } = await supabase
    .from('events')
    .update({ joinable: body.joinable })
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
