import { useEffect, useRef } from "react"
import { useLocation } from "react-router-dom"

// Routes where scroll should always start at top (never restored)
const RESET_ROUTES = ["/login", "/signup", "/review"]

function shouldReset(pathname: string): boolean {
  return RESET_ROUTES.some(
    route => pathname === route || pathname.startsWith("/review/")
  )
}

/**
 * Saves and restores the scroll position of the <main> scroll container
 * per route, using sessionStorage so it persists within the tab session
 * but resets on a fresh load.
 *
 * Attach the returned ref to the scrollable <main> element.
 */
export function useScrollMemory() {
  const location = useLocation()
  const mainRef = useRef<HTMLElement | null>(null)

  // Key per pathname (ignore search/hash for simplicity)
  const storageKey = `scroll:${location.pathname}`

  // On route change: save previous scroll, then restore new route's scroll
  useEffect(() => {
    const el = mainRef.current
    if (!el) return

    if (shouldReset(location.pathname)) {
      el.scrollTop = 0
      return
    }

    // Restore saved position for this route
    const saved = sessionStorage.getItem(storageKey)
    if (saved !== null) {
      // Use requestAnimationFrame to wait for layout to settle
      requestAnimationFrame(() => {
        el.scrollTop = parseInt(saved, 10)
      })
    } else {
      el.scrollTop = 0
    }

    // Save scroll position when user scrolls
    function handleScroll() {
      sessionStorage.setItem(storageKey, String(el!.scrollTop))
    }

    el.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      el.removeEventListener("scroll", handleScroll)
    }
  }, [location.pathname, storageKey])

  return mainRef
}
