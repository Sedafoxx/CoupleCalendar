import { supabase } from '@/lib/supabase'
import type { NextRequest } from 'next/server'

type Ctx = { params: Promise<{ id: string }> }

export async function DELETE(_: NextRequest, { params }: Ctx) {
  const { id } = await params
  const { error } = await supabase.from('bucket_list').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return new Response(null, { status: 204 })
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params
  const body = await req.json()
  const { data, error } = await supabase
    .from('bucket_list')
    .update(body)
    .eq('id', id)
    .select()
    .single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
