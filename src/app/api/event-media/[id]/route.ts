import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { isTheresaAuthed } from '@/lib/theresa-auth'
import { NextRequest } from 'next/server'

type RouteParams = { params: Promise<{ id: string }> }

async function whoIs(req: NextRequest): Promise<'dimitri' | 'theresa' | null> {
  const session = await getServerSession(authOptions)
  if (session) return 'dimitri'
  if (isTheresaAuthed(req)) return 'theresa'
  return null
}

/** Extract the storage object path from a public URL, if it's in memory-photos. */
function extractPath(url: string): string | null {
  const prefix = '/storage/v1/object/public/memory-photos/'
  const idx = url.indexOf(prefix)
  if (idx === -1) return null
  return url.substring(idx + prefix.length)
}

/**
 * DELETE /api/event-media/:id
 * Deletes a media item and its storage file (if any).
 */
export async function DELETE(req: NextRequest, ctx: RouteParams) {
  const who = await whoIs(req)
  if (!who) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const { data: item, error: fetchError } = await supabase
    .from('event_media')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !item) {
    return Response.json({ error: 'Media item not found' }, { status: 404 })
  }

  if (who !== 'dimitri' && item.added_by !== who) {
    return Response.json({ error: 'Not authorized to delete this item' }, { status: 403 })
  }

  const { error: deleteError } = await supabase.from('event_media').delete().eq('id', id)
  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 })

  // Best-effort storage cleanup for photo/video items.
  if (item.url) {
    const path = extractPath(item.url)
    if (path) supabase.storage.from('memory-photos').remove([path]).catch(() => {})
  }

  return new Response(null, { status: 204 })
}

/**
 * PATCH /api/event-media/:id
 * Update caption (and optionally the storage URL after a re-upload).
 * Body: JSON { caption?, url? }
 */
export async function PATCH(req: NextRequest, ctx: RouteParams) {
  const who = await whoIs(req)
  if (!who) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const { data: item, error: fetchError } = await supabase
    .from('event_media')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !item) {
    return Response.json({ error: 'Media item not found' }, { status: 404 })
  }

  if (who !== 'dimitri' && item.added_by !== who) {
    return Response.json({ error: 'Not authorized to edit this item' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, string> = {}
  if ('caption' in body) updates.caption = body.caption ?? null
  if (typeof body.url === 'string') updates.url = body.url

  if (!Object.keys(updates).length) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('event_media')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 })
  return Response.json(updated)
}
