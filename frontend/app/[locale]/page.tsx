import type { Metadata } from "next"
import { headers } from "next/headers"
import HomeClient from "./HomeClient"
import type { ServicePreview } from "@/views/Home"
import type { AppLocale } from "@/i18n/routing"
import { SERVER_API_BASE_URL } from "@/lib/serverApiUrl"

export const metadata: Metadata = {
  title: "United Services Egypt | Pipeline Integrity & Corrosion Control",
  description:
    "GRE lining, FBE coating, external wrapping, HDPE lining, RTP systems, and RTV insulator coating for the oil, gas, and power sectors — engineered and manufactured in Cairo since 2005.",
  openGraph: {
    title: "United Services Egypt",
    description:
      "Pipeline integrity and corrosion-control systems for the oil, gas, and power sectors.",
    type: "website",
  },
}

// No CSP hash to keep in sync anymore — this script's nonce prop (read
// from the per-request header proxy.ts sets) is what CSP checks now, not
// its content, so editing this object needs no corresponding config change.
const structuredData = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "United Services Egypt",
  alternateName: "USE",
  description:
    "Pipeline integrity and corrosion-control systems for the oil, gas, and power sectors.",
  foundingDate: "2005",
  address: {
    "@type": "PostalAddress",
    streetAddress: "14S Building, El Oroba Street Extension",
    addressLocality: "New Maadi, Cairo",
    addressCountry: "EG",
  },
  telephone: "+20227033656",
  email: "info@use-eg.com",
  areaServed: ["Egypt", "Iraq", "Saudi Arabia", "United Arab Emirates"],
}

// Server-fetched so the services carousel is present in the first HTML
// response — see Careers.tsx's page.tsx for the identical reasoning and
// the same revalidate window as the backend's own cache.
async function fetchInitialServices(locale: string): Promise<ServicePreview[] | undefined> {
  try {
    const url = new URL("services", SERVER_API_BASE_URL)
    if (locale !== "en") url.searchParams.set("locale", locale)
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) return undefined
    return await res.json()
  } catch {
    return undefined
  }
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}) {
  const { locale } = await params
  const initialServices = await fetchInitialServices(locale)
  // Reading the request-scoped nonce header opts this page out of static
  // generation/ISR — required for nonce-based CSP (a fresh nonce per
  // request means there's nothing valid to bake into a build-time-static
  // page). See proxy.ts's buildCsp() comment and
  // node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md.
  const nonce = (await headers()).get("x-nonce") ?? undefined
  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <HomeClient initialServices={initialServices} />
    </>
  )
}
