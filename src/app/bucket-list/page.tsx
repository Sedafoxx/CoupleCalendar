'use client'
import { useState, useEffect } from 'react'
import { useSession, signIn } from 'next-auth/react'
import type { BucketListItem } from '@/lib/supabase'

export default function BucketListPage() {
  const { data: session, status } = useSession()
  const [items, setItems] = useState<BucketListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newItem, setNewItem] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (status === 'authenticated') fetchItems()
  }, [status])

  async function fetchItems() {
    const res = await fetch('/api/bucket-list')
    const data = await res.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    if (!newItem.trim()) return
    setAdding(true)
    const res = await fetch('/api/bucket-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newItem.trim(), added_by: 'dimitri' }),
    })
    if (res.ok) {
      const item = await res.json()
      setItems(prev => [item, ...prev])
      setNewItem('')
    }
    setAdding(false)
  }

  async function deleteItem(id: string) {
    await fetch(`/api/bucket-list/${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function toggleResolved(item: BucketListItem) {
    const newVal = !(item as Record<string, unknown>).resolved
    const res = await fetch(`/api/bucket-list/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: newVal }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, resolved: newVal } as BucketListItem : i))
    }
  }

  const pending = items.filter(i => !(i as Record<string, unknown>).resolved)
  const done = items.filter(i => (i as Record<string, unknown>).resolved)

  const TAG_COLORS: Record<string, string> = {
    romantic: 'bg-rose-100 text-rose-600',
    adventure: 'bg-orange-100 text-orange-600',
    food: 'bg-yellow-100 text-yellow-700',
    culture: 'bg-blue-100 text-blue-600',
    outdoor: 'bg-green-100 text-green-600',
    sport: 'bg-purple-100 text-purple-600',
  }

  if (status === 'loading') return <div className="p-8 text-stone-400">Loading...</div>

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-4xl">♡</p>
          <button onClick={() => signIn('google')} className="bg-stone-900 text-white px-6 py-3 rounded-lg hover:bg-stone-700 transition">Sign in with Google</button>
        </div>
      </div>
    )
  }

  function ItemCard({ item, isDone }: { item: BucketListItem; isDone?: boolean }) {
    return (
      <div className={`border rounded-xl p-4 flex items-start justify-between gap-3 ${isDone ? 'bg-stone-50 border-stone-200 opacity-70' : 'bg-white border-stone-200'}`}>
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`font-medium ${isDone ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{item.title}</p>
            {isDone && <span className="text-xs text-rose-400">✅ Done</span>}
          </div>
          {item.description && <p className="text-sm text-stone-500">{item.description}</p>}
          {item.duration_days && <p className="text-xs text-stone-400">{item.duration_days} day{item.duration_days > 1 ? 's' : ''}</p>}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.tags.map(tag => (
                <span key={tag} className={`text-xs px-2 py-0.5 rounded-full ${TAG_COLORS[tag] ?? 'bg-stone-100 text-stone-500'}`}>{tag}</span>
              ))}
            </div>
          )}
          <p className="text-xs text-stone-400">added by {item.added_by === 'theresa' ? 'Theresa ♡' : 'you'}</p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button onClick={() => toggleResolved(item)} className={`text-xs px-3 py-1.5 rounded-full font-medium transition ${isDone ? 'bg-stone-200 text-stone-500 hover:bg-stone-300' : 'bg-green-100 text-green-600 hover:bg-green-200'}`}>
            {isDone ? '↩ Undo' : '✅ Done'}
          </button>
          <button onClick={() => deleteItem(item.id)} className="text-xs text-stone-300 hover:text-red-400 transition">Delete</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6 pb-28 space-y-6">
      <header className="pt-2">
        <h1 className="text-2xl font-bold">✨ Bucket List</h1>
        <p className="text-sm text-stone-400 mt-0.5">Things we want to do together</p>
      </header>

      <form onSubmit={addItem} className="flex gap-2">
        <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Add to bucket list..." className="flex-1 border border-stone-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" />
        <button type="submit" disabled={adding || !newItem.trim()} className="bg-gradient-to-r from-rose-400 to-pink-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:from-rose-500 hover:to-pink-600 transition disabled:opacity-40 shadow-sm">{adding ? '...' : '+ Add'}</button>
      </form>

      {loading ? (
        <p className="text-stone-400 text-sm">Loading...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-4xl">✨</p>
          <p className="text-stone-400 text-sm">No bucket list items yet. Chat with the AI to add some!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pending items */}
          {pending.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-semibold text-stone-700 text-sm">✨ To Do</h3>
              {pending.map(item => <ItemCard key={item.id} item={item} />)}
            </section>
          )}

          {/* Done items */}
          {done.length > 0 && (
            <section className="space-y-2">
              <h3 className="font-semibold text-stone-700 text-sm">✅ Done</h3>
              {done.map(item => <ItemCard key={item.id} item={item} isDone />)}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
