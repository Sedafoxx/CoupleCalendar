import { getFreeBusySlots } from '@/lib/freebusy'

export async function GET() {
  try {
    const slots = await getFreeBusySlots()
    return Response.json(slots)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (msg.includes('No Google tokens')) {
      return Response.json({ error: 'Kalender nicht verbunden. Dimitri muss sich zuerst einloggen.' }, { status: 503 })
    }
    if (msg.includes('Work calendar')) {
      return Response.json({ error: `Arbeit-Kalender nicht lesbar: ${msg}. Bitte in Google Calendar freigeben.` }, { status: 503 })
    }
    return Response.json({ error: msg }, { status: 500 })
  }
}
