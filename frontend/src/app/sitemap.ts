import type { MetadataRoute } from 'next'
import { routing } from '@/i18n/routing'

const BASE_URL = 'https://use-eg.com'

const STATIC_ROUTES = ['/', '/about', '/vision', '/services', '/projects', '/careers', '/contact']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.flatMap((route) =>
    routing.locales.map((locale) => ({
      url: `${BASE_URL}/${locale}${route === '/' ? '' : route}`,
      lastModified: new Date(),
      alternates: {
        languages: Object.fromEntries(
          routing.locales.map((l) => [l, `${BASE_URL}/${l}${route === '/' ? '' : route}`]),
        ),
      },
    })),
  )

  // Best-effort: if the API isn't reachable at build time, the sitemap still
  // ships with the static marketing routes above.
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
    const res = await fetch(`${apiUrl}/services`, { next: { revalidate: 3600 } })
    if (res.ok) {
      const services: { slug: string; updatedAt: string }[] = await res.json()
      for (const s of services) {
        for (const locale of routing.locales) {
          entries.push({ url: `${BASE_URL}/${locale}/services#${s.slug}`, lastModified: new Date(s.updatedAt) })
        }
      }
    }
  } catch {
    // ignore — static routes above are still returned
  }

  return entries
}
