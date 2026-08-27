import type { Metadata } from "next"
import ServicesClient from "./ServicesClient"
import type { Service } from "@/views/Services"
import type { AppLocale } from "@/i18n/routing"
import { SERVER_API_BASE_URL } from "@/lib/serverApiUrl"

export const metadata: Metadata = {
  title: "Services | United Services Egypt",
  description:
    "GRE tubular lining, external wrapping, industrial coating, HDPE lining, RTP systems, and RTV insulator coating — six certified corrosion-control systems engineered at our Cairo facility.",
}

// Server-fetched so the services list (and each service's presigned
// image URL, valid well beyond this cache window) is present in the
// first HTML response — see Careers.tsx's page.tsx for the identical
// reasoning and the same revalidate window as the backend's own cache.
async function fetchInitialServices(locale: string): Promise<Service[] | undefined> {
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

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}) {
  const { locale } = await params
  const initialServices = await fetchInitialServices(locale)
  return <ServicesClient initialServices={initialServices} />
}
