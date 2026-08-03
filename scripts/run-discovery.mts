// One-off: run the real discovery ingest (gogogo + yesticket + RA + ImPulsTanz).
// Usage: npx tsx scripts/run-discovery.mts
import { readFileSync } from 'node:fs'

const envText = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const { runDiscovery } = await import('../src/lib/discovery')
const result = await runDiscovery()
console.log('Discovery result:', JSON.stringify(result))
