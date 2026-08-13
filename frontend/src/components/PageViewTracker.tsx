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
import { api } from "@/lib/api"
export default function PageViewTracker() {
  const pathname = usePathname()

  useEffect(() => {
    api.post("/analytics/track", { eventType: "page_view" }).catch(() => {})
  }, [pathname])

  return null
}
