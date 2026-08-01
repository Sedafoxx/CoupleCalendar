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

/**
 * PATCH /api/memories/:id
 *
 * Updates a memory's photo_front, photo_back, and/or caption.
 * Body: FormData with optional photo_front (File), photo_back (File), caption (string)
 */
export async function PATCH(req: NextRequest, ctx: RouteParams) {
  const who = await whoIs(req)
  if (!who) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params

  // Fetch existing memory
  const { data: memory, error: fetchError } = await supabase
    .from('memories')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !memory) {
    return Response.json({ error: 'Memory not found' }, { status: 404 })
  }

  // Allow edit by either the original capturer or Dimitri
  if (who !== 'dimitri' && memory.captured_by !== who) {
    return Response.json({ error: 'Not authorized to edit this memory' }, { status: 403 })
  }

  const formData = await req.formData()
  const photoFront = formData.get('photo_front') as File | null
  const photoBack = formData.get('photo_back') as File | null
  const caption = formData.get('caption') as string | null

  const updates: Record<string, string> = {}
  const oldPhotos: string[] = []

  // Upload new front photo if provided
  if (photoFront) {
    const frontBytes = await photoFront.arrayBuffer()
    const frontExt = photoFront.name.split('.').pop() || 'jpg'
    const frontPath = `${who}/${memory.event_id}/${Math.random().toString(36).slice(2, 10)}-front.${frontExt}`

    const { data: frontUpload, error: frontError } = await supabase.storage
      .from('memory-photos')
      .upload(frontPath, frontBytes, { contentType: photoFront.type || 'image/jpeg', upsert: false })

    if (frontError) {
      console.error('[memories PATCH] front upload failed:', frontError.message)
      return Response.json({ error: `Front photo upload failed: ${frontError.message}` }, { status: 500 })
    }

    if (frontUpload) {
      const { data: { publicUrl } } = supabase.storage.from('memory-photos').getPublicUrl(frontUpload.path)
      updates.photo_front = publicUrl
      oldPhotos.push(memory.photo_front)
    }
  }

  // Upload new back photo if provided
  if (photoBack) {
    const backBytes = await photoBack.arrayBuffer()
    const backExt = photoBack.name.split('.').pop() || 'jpg'
    const backPath = `${who}/${memory.event_id}/${Math.random().toString(36).slice(2, 10)}-back.${backExt}`

    const { data: backUpload, error: backError } = await supabase.storage
      .from('memory-photos')
      .upload(backPath, backBytes, { contentType: photoBack.type || 'image/jpeg', upsert: false })

    if (backError) {
      console.error('[memories PATCH] back upload failed:', backError.message)
      return Response.json({ error: `Photo upload failed: ${backError.message}` }, { status: 500 })
    }

    if (backUpload) {
      const { data: { publicUrl } } = supabase.storage.from('memory-photos').getPublicUrl(backUpload.path)
      updates.photo_back = publicUrl
      oldPhotos.push(memory.photo_back)
    }
  }

  // Update caption if provided
  if (caption !== null) updates.caption = caption

  if (!Object.keys(updates).length) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('memories')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 })

  // Clean up old photos in background
  for (const oldUrl of oldPhotos) {
    const prefix = '/storage/v1/object/public/memory-photos/'
    const idx = oldUrl.indexOf(prefix)
    if (idx !== -1) {
      const path = oldUrl.substring(idx + prefix.length)
      supabase.storage.from('memory-photos').remove([path]).catch(() => {})
    }
  }

  return Response.json(updated)
}
