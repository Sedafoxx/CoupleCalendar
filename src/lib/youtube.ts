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

// Normalize input that may be a full URL OR a bare 11-char id down to the id.
function toId(value: string | null | undefined): string {
  const id = extractYouTubeId(value)
  return id ?? (value || '')
}

/** Highest-resolution thumbnail available for a video URL or id. */
export function youtubeThumbnail(value: string | null | undefined): string {
  return `https://i.ytimg.com/vi/${toId(value)}/hqdefault.jpg`
}

/** Playable embed URL (autoplay=1 for the modal). Accepts a URL or id. */
export function youtubeEmbedUrl(value: string | null | undefined, autoplay = false): string {
  return `https://www.youtube.com/embed/${toId(value)}${autoplay ? '?autoplay=1' : ''}`
}

/** Canonical watch URL for opening in a new tab. Accepts a URL or id. */
export function youtubeWatchUrl(value: string | null | undefined): string {
  const id = extractYouTubeId(value)
  if (id) return `https://www.youtube.com/watch?v=${id}`
  return value || ''
}
