// ── Vienna Weather via Open-Meteo (free, no API key) ──────────

export type WeatherCondition =
  | 'sunny'
  | 'cloudy'
  | 'rainy'
  | 'snowy'
  | 'stormy'
  | 'foggy'

export type DayForecast = {
  date: string
  max: number
  min: number
  condition: WeatherCondition
}

export type WeatherContext = {
  now: { temp: number; condition: WeatherCondition }
  today: DayForecast
  tomorrow: DayForecast | null
  dayAfter: DayForecast | null
}

// WMO Weather codes → human readable
function wmo(code: number): WeatherCondition {
  if (code === 0) return 'sunny'
  if (code <= 3) return 'cloudy'
  if (code <= 48) return 'foggy'
  if (code <= 57) return 'rainy'
  if (code <= 67) return 'rainy'
  if (code <= 77) return 'snowy'
  if (code <= 82) return 'rainy'
  if (code <= 86) return 'snowy'
  return 'stormy'
}

export async function getViennaWeather(): Promise<WeatherContext | null> {
  try {
    const res = await fetch(
      'https://api.open-meteo.com/v1/forecast' +
        '?latitude=48.21&longitude=16.37' +
        '&current=temperature_2m,weather_code' +
        '&daily=temperature_2m_max,temperature_2m_min,weather_code' +
        '&timezone=Europe/Berlin' +
        '&forecast_days=3',
      { next: { revalidate: 900 } } // cache 15 min
    )
    if (!res.ok) return null
    const data = await res.json()

    const daily = data.daily as {
      time: string[]
      temperature_2m_max: number[]
      temperature_2m_min: number[]
      weather_code: number[]
    }

    const days: DayForecast[] = daily.time.map((date, i) => ({
      date,
      max: daily.temperature_2m_max[i],
      min: daily.temperature_2m_min[i],
      condition: wmo(daily.weather_code[i]),
    }))

    return {
      now: {
        temp: Math.round(data.current.temperature_2m),
        condition: wmo(data.current.weather_code),
      },
      today: days[0],
      tomorrow: days[1] ?? null,
      dayAfter: days[2] ?? null,
    }
  } catch {
    return null
  }
}

export function weatherSummary(w: WeatherContext): string {
  const lines: string[] = []
  lines.push(`Now: ${w.now.temp}°C, ${w.now.condition}`)
  lines.push(`Today: ${w.today.condition}, ${w.today.min}–${w.today.max}°C`)
  if (w.tomorrow)
    lines.push(`Tomorrow: ${w.tomorrow.condition}, ${w.tomorrow.min}–${w.tomorrow.max}°C`)
  if (w.dayAfter)
    lines.push(`Day after: ${w.dayAfter.condition}, ${w.dayAfter.min}–${w.dayAfter.max}°C`)
  return lines.join('\n')
}

// ── Feasibility categorisation ──────────────────────────────

export type FeasibilityCategory =
  | 'weather_dependent' // outdoor: swimming, hiking, picnic, sports
  | 'social' // involves other people, needs 3+ days notice
  | 'travel' // needs travel prep: Prague, Salzburg, etc.
  | 'seasonal' // tied to season/month: christmas market, ice skating
  | 'immediate' // can do anytime: coffee, cinema, dinner, museum

const weatherKeywords = [
  'schwimmen', 'bad', 'pool', 'strand', 'hiking', 'wandern',
  'picnic', 'picknick', 'park', 'garten', 'outdoor', 'sport',
  'rad', 'bike', 'fahrrad', 'laufen', 'joggen', 'tennis',
  'beach', 'volleyball', 'fußball', 'golf', 'minigolf',
]

const socialKeywords = [
  'freunde', 'friends', 'double date', 'party', 'feier',
  'spieleabend', 'game night', 'gruppe', 'group',
  'mit freunden', 'with friends',
]

const travelKeywords = [
  'reise', 'trip', 'urlaub', 'prg', 'prag', 'prague',
  'salzburg', 'wien', 'graz', 'innsbruck', 'linz',
  'ausflug', 'roadtrip', 'zug', 'train', 'flight',
  'weekend trip', 'städtetrip',
]

const seasonalKeywords: [string, number][] = [
  ['christmas', 12], ['weihnacht', 12], ['christkindl', 12],
  ['advent', 12], ['eislauf', 1], ['ice skating', 1],
  ['schlittschuh', 1], ['schnee', 12],
]

export function categorizeItem(title: string, tags: string[] | null): FeasibilityCategory {
  const lower = title.toLowerCase()
  const tagStr = (tags ?? []).join(' ').toLowerCase()

  // Check seasonal first (most specific)
  for (const [kw] of seasonalKeywords) {
    if (lower.includes(kw) || tagStr.includes(kw)) return 'seasonal'
  }

  // Check travel
  if (travelKeywords.some(k => lower.includes(k) || tagStr.includes(k))) return 'travel'

  // Check social
  if (socialKeywords.some(k => lower.includes(k) || tagStr.includes(k))) return 'social'

  // Check weather-dependent
  if (weatherKeywords.some(k => lower.includes(k) || tagStr.includes(k))) return 'weather_dependent'

  // Tags-based
  if (tagStr.includes('outdoor') || tagStr.includes('sport')) return 'weather_dependent'

  // Default
  return 'immediate'
}

export function feasibilityReason(
  category: FeasibilityCategory,
  weather: WeatherContext | null,
  today: string,
  dayOfWeek: number,
): { feasible: boolean; reasoning: string } {
  switch (category) {
    case 'weather_dependent': {
      if (!weather) return { feasible: true, reasoning: 'Wetter nicht prüfbar — geh einfach davon aus.' }
      if (['rainy', 'snowy', 'stormy'].includes(weather.now.condition)) {
        return { feasible: false, reasoning: `Leider ${weather.now.condition} (${weather.now.temp}°C) — heute nicht so schön.` }
      }
      return { feasible: true, reasoning: `${weather.now.temp}°C und ${weather.now.condition} — perfekt! ☀️` }
    }
    case 'seasonal': {
      const month = new Date(today).getMonth() + 1
      if (month >= 3 && month <= 5) return { feasible: false, reasoning: 'Ist grad Frühling — dafür noch nicht die richtige Jahreszeit.' }
      if (month >= 6 && month <= 8) return { feasible: false, reasoning: 'Sommer — dafür ists noch zu früh/zu spät im Jahr.' }
      if (month >= 9 && month <= 11) return { feasible: false, reasoning: 'Herbst — bald vielleicht, aber noch nicht.' }
      return { feasible: true, reasoning: 'Es ist Winter — perfekte Zeit dafür! 🎄' }
    }
    case 'social': {
      const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
      return {
        feasible: true,
        reasoning: `Braucht 3+ Tage Vorlauf. Frühestens ${dayNames[(dayOfWeek + 3) % 7]} möglich.`,
      }
    }
    case 'travel': {
      return { feasible: true, reasoning: 'Braucht ein bissl Planung — am besten fürs Wochenende einplanen.' }
    }
    case 'immediate': {
      return { feasible: true, reasoning: 'Kann man praktisch immer machen! ♡' }
    }
  }
}
