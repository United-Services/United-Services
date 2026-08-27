import type { Metadata } from "next"
import CareersClient from "./CareersClient"
import type { OpenPosition } from "@/views/Careers"
import type { AppLocale } from "@/i18n/routing"
import { SERVER_API_BASE_URL } from "@/lib/serverApiUrl"

export const metadata: Metadata = {
  title: "Careers | United Services Egypt",
  description:
    "Join the team that protects the region's infrastructure. Open engineering, operations, quality, HSE, and commercial roles across Egypt and the Gulf.",
}

// Server-fetched so the open-positions list is present in the first HTML
// response instead of only appearing after a client-side round trip (see
// Careers.tsx's initialPositions prop). `next: { revalidate }` mirrors
// the backend's own Redis cache TTL for this same list
// (positions.controller.ts's CACHE_TTL_SECONDS) — no point caching this
// page's HTML any fresher than the data underneath it actually changes.
// Never throws: a failed fetch here just falls back to Careers.tsx's own
// client-side fetch, same as before this existed.
async function fetchInitialPositions(locale: string): Promise<OpenPosition[] | undefined> {
  try {
    const url = new URL("positions", SERVER_API_BASE_URL)
    if (locale !== "en") url.searchParams.set("locale", locale)
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return undefined
    return await res.json()
  } catch {
    return undefined
  }
}

export default async function CareersPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}) {
  const { locale } = await params
  const initialPositions = await fetchInitialPositions(locale)
  return <CareersClient initialPositions={initialPositions} />
}
