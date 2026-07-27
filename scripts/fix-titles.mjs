import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf-8')
const url = env.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL')).split('=')[1].trim()
const key = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim()
const supabase = createClient(url, key)

const fixes = [
  ['Bei mir — dein meine Musik gezeigt ♡', 'Bei mir — dir meine Musik gezeigt ♡'],
  ['Eis essen — zum ersten Mal vor dein geweint — dein meinen Song & das Musikvideo gezeigt ♡', 'Eis essen — zum ersten Mal vor dir geweint — dir meinen Song & das Musikvideo gezeigt ♡'],
]

for (const [oldT, newT] of fixes) {
  const { data, error } = await supabase.from('events').update({ title: newT }).eq('title', oldT).select()
  if (error) console.log('❌', error.message)
  else if (data?.length) console.log('✅', oldT.substring(0, 40), '→', newT.substring(0, 40))
  else console.log('⚠️  Not found:', oldT.substring(0, 40))
}

console.log('Done')
