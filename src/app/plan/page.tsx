'use client'
import { useState, useEffect } from 'react'

type FreeSlot = { start: string; end: string }
type DateSlots = { date: string; freeSlots: FreeSlot[] }

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-AT', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

const HEARTS = [
  { left: '5%',  size: '1.2rem', delay: '0s',    dur: '6s'  },
  { left: '15%', size: '0.8rem', delay: '1.2s',  dur: '7s'  },
  { left: '25%', size: '1.5rem', delay: '0.4s',  dur: '5.5s'},
  { left: '38%', size: '1rem',   delay: '2s',    dur: '8s'  },
  { left: '50%', size: '1.8rem', delay: '0.8s',  dur: '6.5s'},
  { left: '62%', size: '0.9rem', delay: '1.6s',  dur: '7.5s'},
  { left: '72%', size: '1.3rem', delay: '0.2s',  dur: '6s'  },
  { left: '82%', size: '0.7rem', delay: '2.4s',  dur: '5s'  },
  { left: '91%', size: '1.1rem', delay: '1s',    dur: '7s'  },
  { left: '45%', size: '2rem',   delay: '3s',    dur: '9s'  },
  { left: '8%',  size: '0.6rem', delay: '3.5s',  dur: '6s'  },
  { left: '58%', size: '1.4rem', delay: '2.8s',  dur: '8s'  },
]

export default function PlanPage() {
  const [data, setData] = useState<DateSlots[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [booking, setBooking] = useState<{
    date: string
    slot: FreeSlot
    start: string
    end: string
  } | null>(null)
  const [booked, setBooked] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function loadSlots() {
    setLoading(true)
    setError('')
    fetch('/api/freebusy')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(Array.isArray(d) ? d : [])
      })
      .catch(() => setError('Laden fehlgeschlagen. Nochmal versuchen.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadSlots() }, [])

  function openBooking(date: string, slot: FreeSlot) {
    setBooking({ date, slot, start: slot.start, end: slot.end })
  }

  async function submitBooking(e: React.FormEvent) {
    e.preventDefault()
    if (!booking) return
    setSubmitting(true)

    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Dimi & Theresa',
        location: '',
        startTime: booking.start,
        endTime: booking.end,
      }),
    })

    if (res.ok) {
      setBooked(true)
      setBooking(null)
    } else {
      const d = await res.json()
      setError(d.error ?? 'Buchung fehlgeschlagen.')
    }
    setSubmitting(false)
  }

  if (booked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #fff0f3 0%, #ffe4ec 50%, #ffd6e7 100%)' }}>
        <FloatingHearts />
        <div className="text-center space-y-4 relative z-10">
          <div className="text-6xl animate-bounce">💕</div>
          <h2 className="text-3xl font-bold text-rose-600">Es ist ein Date!</h2>
          <p className="text-stone-500">Dimi freut sich schon auf dich ♡</p>
          <button
            onClick={() => { setBooked(false); loadSlots(); }}
            className="text-sm text-rose-400 hover:text-rose-600 underline transition"
          >
            Noch einen Termin buchen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #fff0f3 0%, #ffe4ec 60%, #fce7f3 100%)' }}>
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0) scale(1);   opacity: 0.7; }
          50%  { transform: translateY(-45vh) scale(1.1); opacity: 0.4; }
          100% { transform: translateY(-95vh) scale(0.8); opacity: 0; }
        }
        .heart-float {
          position: fixed;
          bottom: -2rem;
          animation: floatUp linear infinite;
          pointer-events: none;
          user-select: none;
          z-index: 0;
        }
      `}</style>

      <FloatingHearts />

      <div className="relative z-10 max-w-md mx-auto px-5 py-10 space-y-7">

        <header className="text-center space-y-2 pt-4">
          <p className="text-5xl">💌</p>
          <h1 className="text-3xl font-bold text-rose-700">Hey Theresa,</h1>
          <p className="text-rose-400 font-medium text-lg">wann hast du Zeit? ♡</p>
          <p className="text-stone-400 text-sm pt-1">Dimi hat da noch nichts vor. Such dir was aus :)</p>
        </header>

        {loading && (
          <p className="text-center text-rose-300 text-sm animate-pulse">Lade Termine...</p>
        )}
        {error && (
          <p className="text-center text-red-400 text-sm bg-red-50 rounded-xl px-4 py-3">{error}</p>
        )}

        {!loading && !error && data.length === 0 && (
          <div className="text-center py-8 space-y-2">
            <p className="text-4xl">🌸</p>
            <p className="text-stone-400 text-sm">Gerade keine freien Zeiten. Schau bald wieder vorbei 💕</p>
          </div>
        )}

        <ul className="space-y-4">
          {data.map(({ date, freeSlots }) => (
            <li key={date} className="bg-white/80 backdrop-blur-sm border border-rose-100 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-rose-50">
                <p className="font-semibold text-stone-800">{fmtDate(date)}</p>
              </div>
              <div className="px-4 py-3 space-y-2">
                <p className="text-xs text-rose-300 uppercase tracking-widest px-1">Dimi ist frei</p>
                {freeSlots.map((slot, i) => (
                  <button
                    key={i}
                    onClick={() => openBooking(date, slot)}
                    className="w-full text-left px-4 py-3 rounded-xl bg-rose-50 hover:bg-rose-100 active:scale-95 transition-all text-sm flex justify-between items-center group"
                  >
                    <span className="font-medium text-stone-700">{fmt(slot.start)} – {fmt(slot.end)} Uhr</span>
                    <span className="text-rose-400 text-xs group-hover:scale-125 transition-transform">♡</span>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {booking && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-5 shadow-xl">
            <div className="text-center space-y-1">
              <p className="text-3xl">🗓️</p>
              <h3 className="font-bold text-xl text-stone-800">{fmtDate(booking.date)}</h3>
              <p className="text-sm text-stone-400">Wann sollen wir uns treffen?</p>
            </div>

            <form onSubmit={submitBooking} className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-stone-400 block mb-1.5">Von</label>
                  <input
                    type="time"
                    required
                    value={new Date(booking.start).toTimeString().slice(0, 5)}
                    min={new Date(booking.slot.start).toTimeString().slice(0, 5)}
                    max={new Date(booking.slot.end).toTimeString().slice(0, 5)}
                    onChange={e => {
                      const [h, m] = e.target.value.split(':')
                      const d = new Date(booking.slot.start)
                      d.setHours(Number(h), Number(m), 0, 0)
                      setBooking(b => b ? { ...b, start: d.toISOString() } : b)
                    }}
                    className="w-full border border-rose-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 bg-rose-50/50"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-stone-400 block mb-1.5">Bis</label>
                  <input
                    type="time"
                    required
                    value={new Date(booking.end).toTimeString().slice(0, 5)}
                    min={new Date(booking.slot.start).toTimeString().slice(0, 5)}
                    max={new Date(booking.slot.end).toTimeString().slice(0, 5)}
                    onChange={e => {
                      const [h, m] = e.target.value.split(':')
                      const d = new Date(booking.slot.end)
                      d.setHours(Number(h), Number(m), 0, 0)
                      setBooking(b => b ? { ...b, end: d.toISOString() } : b)
                    }}
                    className="w-full border border-rose-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 bg-rose-50/50"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBooking(null)}
                  className="flex-1 border border-stone-100 py-3 rounded-xl text-sm text-stone-400 hover:bg-stone-50 transition"
                >
                  Vielleicht nicht
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-gradient-to-r from-rose-400 to-pink-500 text-white py-3 rounded-xl text-sm font-medium hover:from-rose-500 hover:to-pink-600 transition disabled:opacity-50 shadow-sm"
                >
                  {submitting ? 'Speichern...' : 'Es ist ein Date ♡'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function FloatingHearts() {
  return (
    <>
      {HEARTS.map((h, i) => (
        <span
          key={i}
          className="heart-float text-rose-300"
          style={{ left: h.left, fontSize: h.size, animationDelay: h.delay, animationDuration: h.dur }}
        >
          ♡
        </span>
      ))}
    </>
  )
}
