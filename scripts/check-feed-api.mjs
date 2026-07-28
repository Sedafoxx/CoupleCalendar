// Check what the events API returns
const base = 'https://dimi-time.vercel.app'

async function main() {
  const res = await fetch(`${base}/api/events?past=true`)
  const data = await res.json()
  console.log('Events returned:', Array.isArray(data) ? data.length : 'NOT ARRAY')

  if (!Array.isArray(data)) {
    console.log('Response:', JSON.stringify(data).substring(0, 200))
    return
  }

  const today = new Date().toISOString().split('T')[0]
  console.log('Today:', today)

  const personal = data.filter(e => e.category !== 'city')
  const past = personal.filter(e => e.date < today)
  const future = personal.filter(e => e.date >= today)

  console.log(`\nPersonal events: ${personal.length}`)
  console.log(`Past: ${past.length}`)
  console.log(`Future: ${future.length}`)

  console.log('\nAll dates:')
  const dates = [...new Set(personal.map(e => e.date))].sort()
  for (const d of dates) {
    const evs = personal.filter(e => e.date === d)
    console.log(` ${d} — ${evs.length} events`)
  }
}

main().catch(console.error)
