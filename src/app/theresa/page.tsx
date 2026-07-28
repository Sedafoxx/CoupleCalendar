'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Redirect to the unified homepage — both Dimi and Theresa use the same view now.
export default function TheresaRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/') }, [router])
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-stone-400 animate-pulse">♡ Weiterleitung...</p>
    </div>
  )
}
