import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync('.env.local', 'utf-8')
const supabaseUrl = env.split('\n').find(l => l.startsWith('NEXT_PUBLIC_SUPABASE_URL')).split('=')[1].trim()
const serviceKey = env.split('\n').find(l => l.startsWith('SUPABASE_SERVICE_ROLE_KEY')).split('=')[1].trim()
const supabase = createClient(supabaseUrl, serviceKey)

// 1. Delete Albert & Tina event (didn't actually go)
const { error: e1 } = await supabase.from('events').delete().eq('title', 'Albert & Tina Exclusive Open-Air Afterwork')
console.log('Delete Albert & Tina:', e1 ? 'Error: '+e1.message : 'OK')

// 2. Delete "First Date Part 2" (merged into main entry)
const { data: parts } = await supabase.from('events').select('id,title').eq('date', '2026-05-23')
for (const p of parts || []) console.log('  May 23:', p.title)

const { error: e2 } = await supabase.from('events').delete().eq('date', '2026-05-23').ilike('title', '%Part 2%')
console.log('Delete Part 2:', e2 ? 'Error: '+e2.message : 'OK')

// 3. Update first date entry with longer title
const { error: e3 } = await supabase.from('events').update({
  title: 'Unser erstes Date ♡ — Westbahnhof, Ikea Flohmarkt, Joe & Joe, Rave, frndswave bei G5'
}).eq('date', '2026-05-23').ilike('title', '%First Date ♡%')
console.log('Update main date:', e3 ? 'Error: '+e3.message : 'OK')

// 4. Rename all seed events to German
const renames = {
  'House Party — first time meeting Theresa ♡': 'Kennenlernen auf einer House Party ♡',
  'Beim Umzug von Klara geholfen + Brot und Spiele': 'Klara beim Umzug geholfen + Brot und Spiele',
  'Bei mir zuhause — ihr meine Musik gezeigt ♡': 'Bei mir — ihr meine Musik gezeigt ♡',
  'Baden in der Alten Donau — ihren Bruder getroffen — erste "Ich liebe dich" ♡♡♡': 'Baden in der Alten Donau — ihren Bruder getroffen — erstes "Ich liebe dich" ♡♡♡',
  'Eis essen — zum ersten Mal vor ihr geweint — ihr mein Song & Musikvideo gezeigt ♡': 'Eis essen — zum ersten Mal vor ihr geweint — ihr meinen Song & das Musikvideo gezeigt ♡',
  'Tiefes Gespräch an der Strudlhof Stiege + Badeschiff am Donaukanal': 'Tiefes Gespräch an der Strudlhof Stiege + Badeschiff am Donaukanal ♡',
}

for (const [oldTitle, newTitle] of Object.entries(renames)) {
  const { error } = await supabase.from('events').update({ title: newTitle }).eq('title', oldTitle)
  if (error) console.log(`  Rename failed: ${oldTitle.substring(0,30)}... — ${error.message}`)
  else console.log(`  ✅ "${oldTitle.substring(0,30)}..."`)
}

console.log('\nDone!')
