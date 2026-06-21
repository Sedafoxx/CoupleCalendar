import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { NextRequest } from 'next/server'

// Dimitri's notification feed. Theresa never reads this.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

// Mark notifications read. Body: { ids: string[] } or {} to mark all.
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids } = await req.json().catch(() => ({ ids: undefined }))

  let q = supabase.from('notifications').update({ read: true })
  q = Array.isArray(ids) && ids.length ? q.in('id', ids) : q.eq('read', false)

  const { error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
