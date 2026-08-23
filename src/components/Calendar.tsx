'use client'
import { useState, useEffect, useMemo } from 'react'
import type { Event, Memory } from '@/lib/supabase'
import { occurrencesBetween } from '@/lib/event-utils'

// ── Helpers ────────────────────────────────────────────────
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function fmtDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-AT', {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ── Calendar Props ─────────────────────────────────────────
interface CalendarProps {
  events: Event[]
  memories: Memory[]
  loading?: boolean
  onSelectDate?: (dateStr: string) => void
  onSelectEvent?: (event: Event) => void
  onAddMemory?: (event: Event) => void
}

// ── Component ──────────────────────────────────────────────
export default function Calendar({
  events,
  memories,
  loading,
  onSelectDate,
  onSelectEvent,
  onAddMemory,
}: CalendarProps) {
  const [viewDate, setViewDate] = useState(new Date())
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  // Build lookup maps — recurring events are expanded across every occurrence
  // in the currently viewed month, so a "weekly:sunday" event shows a dot on
  // every Sunday instead of only its first date.
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>()
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
    const firstStr = toDateStr(year, month, 1)
    const lastStr = toDateStr(year, month, lastDayOfMonth)
    for (const ev of events) {
      for (const dateStr of occurrencesBetween(ev, firstStr, lastStr)) {
        const existing = map.get(dateStr) || []
        existing.push(ev)
        map.set(dateStr, existing)
      }
    }
    return map
  }, [events, year, month])

  const memoriesByDate = useMemo(() => {
    const map = new Map<string, Memory[]>()
    for (const m of memories) {
      // Memories don't have a date field directly — use created_at date
      const dateKey = m.created_at?.split('T')[0]
      if (dateKey) {
        const existing = map.get(dateKey) || []
        existing.push(m)
        map.set(dateKey, existing)
      }
    }
    return map
  }, [memories])

  // Calendar grid calculation
  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startPad = (firstDay.getDay() + 6) % 7 // Monday-start
    const daysInMonth = lastDay.getDate()
    const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7

    const cells: Array<{ day: number; dateStr: string; isCurrentMonth: boolean }> = []

    for (let i = 0; i < totalCells; i++) {
      const day = i - startPad + 1
      const isCurrentMonth = day >= 1 && day <= daysInMonth
      const dateStr = isCurrentMonth ? toDateStr(year, month, day) : ''
      cells.push({ day, dateStr, isCurrentMonth })
    }

    return cells
  }, [year, month])

  const todayStr = new Date().toISOString().split('T')[0]

  // Navigation
  const prevMonth = () => setViewDate(new Date(year, month - 1, 1))
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1))
  const goToday = () => setViewDate(new Date())

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-stone-400 animate-pulse">Loading calendar...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Month header */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="p-2 text-stone-400 hover:text-stone-700 transition text-lg"
        >
          ←
        </button>
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-lg text-stone-800">
            {MONTHS[month]} {year}
          </h3>
          <button
            onClick={goToday}
            className="text-xs text-rose-400 hover:text-rose-600 transition underline"
          >
            Today
          </button>
        </div>
        <button
          onClick={nextMonth}
          className="p-2 text-stone-400 hover:text-stone-700 transition text-lg"
        >
          →
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs text-stone-400 font-medium py-1">
            {d}
          </div>
        ))}

        {/* Day cells */}
        {calendarDays.map((cell, i) => {
          const dayEvents = cell.dateStr ? eventsByDate.get(cell.dateStr) || [] : []
          const dayMemories = cell.dateStr ? memoriesByDate.get(cell.dateStr) || [] : []
          const isToday = cell.dateStr === todayStr
          const hasContent = dayEvents.length > 0 || dayMemories.length > 0

          return (
            <button
              key={i}
              onClick={() => cell.dateStr && onSelectDate?.(cell.dateStr)}
              disabled={!cell.isCurrentMonth}
              className={`
                aspect-square rounded-xl p-1 flex flex-col items-center justify-start text-sm
                transition relative
                ${!cell.isCurrentMonth ? 'text-stone-200' : isToday ? 'bg-rose-50 text-stone-800' : 'text-stone-600 hover:bg-stone-50'}
                ${hasContent && cell.isCurrentMonth ? 'cursor-pointer' : ''}
              `}
            >
              <span className={`
                text-xs font-medium
                ${isToday ? 'bg-rose-400 text-white w-6 h-6 rounded-full flex items-center justify-center' : ''}
              `}>
                {cell.isCurrentMonth ? cell.day : ''}
              </span>

              {/* Event dots */}
              {dayEvents.length > 0 && cell.isCurrentMonth && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                  {dayEvents.slice(0, 3).map((_, ei) => (
                    <span key={ei} className="w-1.5 h-1.5 rounded-full bg-rose-300" />
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[8px] text-rose-400">+{dayEvents.length - 3}</span>
                  )}
                </div>
              )}

              {/* Memory photo thumbnails */}
              {dayMemories.length > 0 && cell.isCurrentMonth && (
                <div className="flex -space-x-1 mt-0.5">
                  {dayMemories.slice(0, 3).map((m) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={m.id}
                      src={m.photo_back}
                      alt=""
                      className="w-4 h-4 rounded-full border border-white object-cover"
                    />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
