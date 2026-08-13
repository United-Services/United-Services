import type { MetadataRoute } from 'next'

const BASE_URL = 'https://use-eg.com'

const STATIC_ROUTES = ['/', '/about', '/vision', '/services', '/projects', '/careers', '/contact']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: new Date(),
  }))

  // Best-effort: if the API isn't reachable at build time, the sitemap still
  // ships with the static marketing routes above.
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'
    const res = await fetch(`${apiUrl}/services`, { next: { revalidate: 3600 } })
    if (res.ok) {
      const services: { slug: string; updatedAt: string }[] = await res.json()
      for (const s of services) {
        entries.push({ url: `${BASE_URL}/services#${s.slug}`, lastModified: new Date(s.updatedAt) })
      }
    }
  } catch {
    // ignore — static routes above are still returned
  }

  return entries
}
