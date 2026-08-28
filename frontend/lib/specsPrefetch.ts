import { axios, authHeader } from "./api"

interface Service {
  id: string
  slug: string
  name: string
  shortDescription: string
  longDescription: string
  specs: string[]
  order: number
  imageUrl: string | null
}
interface ServiceFile {
  id: string
  originalFilename: string
  version: number
  uploadedAt: string
}

interface SpecsCache {
  services: Service[]
  serviceFiles: Record<string, ServiceFile[]>
}

// Module-scoped, not React state — this needs to survive AdminSpecsSection
// unmounting (switching sidebar sections) and be reachable from
// AdminDashboard.tsx, which has no reason to otherwise know about specs
// data. Plain singleton is enough here: one admin's browser tab, one
// dashboard, one cache, no cross-user/cross-tab sharing to worry about.
let cache: SpecsCache | null = null
let inFlight: Promise<SpecsCache> | null = null

export function getCachedSpecs(): SpecsCache | null {
  return cache
}

// Warms the browser's own HTTP cache for each service image so that by
// the time the admin/client actually sees the services grid, the <img
// loading="lazy"> there resolves from cache instead of starting a fresh S3
// round trip — this is what makes the prefetch cover images, not just
// the JSON list. Exported for ClientDashboard.tsx too, which fetches
// services directly rather than through prefetchSpecs above (no separate
// "prefetch before section click" step there — it loads everything on
// mount already), but still wants the same image warm-up.
export function warmImageCache(services: { imageUrl: string | null }[]) {
  if (typeof window === "undefined") return
  for (const svc of services) {
    if (!svc.imageUrl) continue
    const img = new window.Image()
    img.src = svc.imageUrl
  }
}

// Called from AdminDashboard.tsx as soon as the dashboard mounts —
// regardless of which section the admin actually lands on — so Specs
// data and images are already warm by the time they click into it.
// AdminSpecsSection.tsx calls this too on its own mount, so a direct
// visit (no prior dashboard warm-up) still works exactly as before,
// just without the head start.
export async function prefetchSpecs(
  getToken: () => Promise<string | null>,
): Promise<SpecsCache> {
  if (cache) return cache
  if (inFlight) return inFlight

  inFlight = (async () => {
    const headers = authHeader(await getToken())
    const { data: services } = await axios.get<Service[]>("/services", {
      headers,
    })

    let serviceFiles: Record<string, ServiceFile[]> = {}
    if (services.length > 0) {
      const ids = services.map((s) => s.id).join(",")
      const { data: latestFiles } = await axios.get<
        Record<string, ServiceFile>
      >("/services/latest-files", { headers, params: { ids } })
      serviceFiles = Object.fromEntries(
        Object.entries(latestFiles).map(([serviceId, file]) => [
          serviceId,
          [file],
        ]),
      )
    }

    warmImageCache(services)
    const result: SpecsCache = { services, serviceFiles }
    cache = result
    return result
  })()

  try {
    return await inFlight
  } finally {
    inFlight = null
  }
}

// Called after any mutation (create/edit/delete service, upload spec/image)
// so the next section visit — or the next prefetch — doesn't serve stale
// data instead of re-fetching.
export function invalidateSpecsCache() {
  cache = null
}
