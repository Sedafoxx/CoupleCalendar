import { supabase } from '@/lib/supabase'

// Server-side only. Do NOT import from client components.
//
// A past event becomes a "memory" once BOTH partners confirmed going
// ("💕 Beide zu"). This helper creates that memory record idempotently —
// a placeholder photo pair is used until a real photo is captured.
//
// Used by:
//  - /api/events/[id]  → creates the memory immediately when a *past* event
//    gets both confirmations (e.g. confirming late).
//  - /api/cron/cleanup → daily sweep: any past, both-confirmed event that
//    slipped through without a memory gets one.

// 1×1 transparent GIF used as the placeholder photo.
const EMPTY_PIXEL = new Uint8Array([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 255, 255, 255, 0, 0, 0,
  33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
])

/**
 * Ensure a "both confirmed" memory placeholder exists for the given event.
 * Returns true if a memory was created, false if one already existed.
 * Idempotent and safe to call repeatedly.
 */
export async function ensureBothConfirmedMemory(
  event: { id: string; title: string },
): Promise<boolean> {
  // Don't double-create — a memory already exists for this event.
  const { data: existingMems } = await supabase
    .from('memories')
    .select('id')
    .eq('event_id', event.id)
    .limit(1)

  if (existingMems && existingMems.length > 0) return false

  const bucket = supabase.storage.from('memory-photos')
  const placeholderPath = `system/placeholder-${event.id}.gif`

  // Upload placeholder if not already present.
  const { data: existingFile } = await bucket.list('system')
  const needsUpload = !existingFile?.some(f => f.name === `placeholder-${event.id}.gif`)
  if (needsUpload) {
    await bucket.upload(placeholderPath, EMPTY_PIXEL, { contentType: 'image/gif', upsert: true })
  }

  const { data: { publicUrl: placeholderUrl } } = bucket.getPublicUrl(placeholderPath)

  const { error } = await supabase.from('memories').insert({
    event_id: event.id,
    captured_by: 'dimitri',
    photo_front: placeholderUrl,
    photo_back: placeholderUrl,
    caption: `💕 Beide zu: ${event.title}`,
  })

  return !error
}
