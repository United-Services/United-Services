"use client"

// Fires a page_view analytics event on first mount and on every client-side
// route change (App Router layouts don't re-run on soft navigation, so this
// can't live server-side in layout.tsx — see commit history). The backend
// resolves the visitor's country server-side from the request IP
// (GeoService) — this call never sends any location data itself. Powers
// the admin dashboard's requests-by-country world map.
// Fire-and-forget — a tracking failure must never surface to the user.

import { useEffect } from "react"
import { usePathname } from "@/i18n/navigation"
import { axios } from "@/lib/api"
import { AnalyticsEventType } from "@/enums/analytics-event-type.enums"

// Collapses duplicate fires for the *same* pathname within this window —
// React StrictMode's double-invoke and dev-only Fast Refresh remounts both
// re-run this effect without the pathname actually changing, which was
// burning through the endpoint's rate limit purely from local editing. A
// real revisit to the same page after this window (even seconds later)
// still counts normally, so production event volume is unaffected — this
// never withholds an event a real distinct page view would have sent.
const DEDUPE_WINDOW_MS = 3000
const STORAGE_KEY = "use_analytics_last_track"

export default function PageViewTracker() {
  const pathname = usePathname()

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const [lastPathname, lastAt] = raw.split("|")
        if (lastPathname === pathname && Date.now() - Number(lastAt) < DEDUPE_WINDOW_MS) {
          return
        }
      }
      sessionStorage.setItem(STORAGE_KEY, `${pathname}|${Date.now()}`)
    } catch {
      // Private-browsing/storage-disabled: fall through and track anyway.
    }

    axios
      .post("/analytics/track", { eventType: AnalyticsEventType.PageView })
      .catch(() => {})
  }, [pathname])

  return null
}
