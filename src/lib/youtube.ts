// Client-safe YouTube helpers (no Supabase import) for detecting video links in
// memory captions/notes and rendering thumbnails + playable embeds.

/** Extract a YouTube video ID from a string that may contain a URL. Returns
 *  null if no recognizable YouTube link is present.
 *
 *  Supports: youtube.com/watch?v=, youtu.be/, youtube.com/shorts/,
 *  youtube.com/embed/, youtube.com/live/ and the /v/ path form. */
export function extractYouTubeId(text: string | null | undefined): string | null {
  if (!text) return null
  const m = text.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  )
  return m ? m[1] : null
}

/** Highest-resolution thumbnail available for a video id. */
export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}

/** Playable embed URL (autoplay=1 for the modal). */
export function youtubeEmbedUrl(id: string, autoplay = false): string {
  return `https://www.youtube.com/embed/${id}${autoplay ? '?autoplay=1' : ''}`
}

/** Canonical watch URL for opening in a new tab. */
export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}
