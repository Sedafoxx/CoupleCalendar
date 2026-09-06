'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { seedActivity, track } from '@/lib/activity'

// Mounted once (in the layout). It:
//  - seeds the persisted recent-activity buffer,
//  - logs every page view (path change),
//  - logs uncaught JS errors & unhandled promise rejections,
//  - logs failed fetch() responses (non-2xx) as warnings so backend/API issues
//    are captured for the "report a bug" context.

export default function ActivityMonitor() {
  const pathname = usePathname()
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    seedActivity()
  }, [])

  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname
      track('page_view', { path: pathname })
    }
  }, [pathname])

  useEffect(() => {
    // Track uncaught errors
    const onError = (event: ErrorEvent) => {
      track(
        'js_error',
        {
          message: event.message?.slice(0, 500),
          filename: event.filename,
          lineno: event.lineno,
        },
        'error',
      )
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      track(
        'unhandled_rejection',
        {
          message:
            reason instanceof Error
              ? reason.message.slice(0, 500)
              : String(reason).slice(0, 500),
        },
        'error',
      )
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  useEffect(() => {
    // Wrap fetch to log non-ok responses (helps surface API bugs). Avoid
    // logging our own logging endpoint to prevent loops.
    const originalFetch = window.fetch
    const urlOf = (input: RequestInfo | URL): string =>
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      try {
        const res = await originalFetch(...args)
        const url = urlOf(args[0])
        const method = (args[1]?.method as string) || 'GET'
        if (!res.ok && !url.includes('/api/log') && !url.includes('/api/bug-report')) {
          track(
            'api_error',
            {
              method,
              url: url.slice(0, 300),
              status: res.status,
              statusText: res.statusText?.slice(0, 100),
            },
            'warn',
          )
        }
        return res
      } catch (err) {
        track(
          'fetch_failed',
          {
            url: urlOf(args[0]).slice(0, 300),
            message: err instanceof Error ? err.message.slice(0, 300) : String(err),
          },
          'error',
        )
        throw err
      }
    }
    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}
