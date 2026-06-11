import { supabase } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function GET() {
  const { data, error } = await supabase
    .from('bucket_list')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function POST(req: NextRequest) {
  const { title, description, tags, duration_days, added_by } = await req.json()
  if (!title) return Response.json({ error: 'title required' }, { status: 400 })

  const { data, error } = await supabase
    .from('bucket_list')
    .insert({
      title,
      description: description ?? null,
      tags: tags ?? null,
      duration_days: duration_days ?? null,
      added_by: added_by ?? 'dimitri',
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
