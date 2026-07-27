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

/**
 * DELETE /api/memories/:id
 *
 * Deletes a memory record and its associated photos from storage.
 */
export async function DELETE(req: NextRequest, ctx: RouteParams) {
  const who = await whoIs(req)
  if (!who) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params

  // Fetch the memory to get the photo URLs and check ownership
  const { data: memory, error: fetchError } = await supabase
    .from('memories')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !memory) {
    return Response.json({ error: 'Memory not found' }, { status: 404 })
  }

  // Allow deletion by either the original capturer or Dimitri
  if (who !== 'dimitri' && memory.captured_by !== who) {
    return Response.json({ error: 'Not authorized to delete this memory' }, { status: 403 })
  }

  // Extract file paths from the public URLs
  const extractPath = (url: string): string | null => {
    const prefix = '/storage/v1/object/public/memory-photos/'
    const idx = url.indexOf(prefix)
    if (idx === -1) return null
    return url.substring(idx + prefix.length)
  }

  const frontPath = extractPath(memory.photo_front)
  const backPath = extractPath(memory.photo_back)

  // Delete photos from storage (in parallel with DB deletion)
  const storageDeletions: Promise<unknown>[] = []
  if (frontPath) storageDeletions.push(supabase.storage.from('memory-photos').remove([frontPath]))
  if (backPath) storageDeletions.push(supabase.storage.from('memory-photos').remove([backPath]))

  // Delete the memory record
  const { error: deleteError } = await supabase
    .from('memories')
    .delete()
    .eq('id', id)

  if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 })

  // Fire-and-forget storage cleanup (don't block response)
  Promise.allSettled(storageDeletions).catch(() => {})

  return new Response(null, { status: 204 })
}
