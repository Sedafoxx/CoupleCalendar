'use client'
import { usePathname, useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', label: 'Memories', icon: '♡' },
  { href: '/calendar', label: 'Calendar', icon: '📅' },
  { href: '/plan', label: 'Plan', icon: '💌' },
] as const

export default function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  // Only show on main app pages, not on Theresa's page
  if (pathname?.startsWith('/theresa')) return null

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-lg border-t border-stone-200 safe-area-bottom">
      <div className="max-w-2xl mx-auto flex items-center justify-around py-2 px-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition ${
                isActive
                  ? 'text-rose-500'
                  : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
