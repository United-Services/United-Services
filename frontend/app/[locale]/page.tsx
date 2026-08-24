import type { Metadata } from "next"
import HomeClient from "./HomeClient"
import type { ServicePreview } from "@/views/Home"
import type { AppLocale } from "@/i18n/routing"

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

// If this object changes, recompute its CSP hash and update the
// script-src 'sha256-...' value in nginx/nginx.conf — the inline
// <script> below is only allowed to run because its exact content
// (JSON.stringify(structuredData)) matches that hash; an edit here with
// a stale hash makes the script silently stop rendering.
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
    const url = new URL("/services", process.env.NEXT_PUBLIC_API_URL)
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
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <HomeClient initialServices={initialServices} />
    </>
  )
}
