import { SkeletonPage } from "@/components/Skeleton"

// Same reasoning as app/[locale]/dashboard/loading.tsx — this route's
// server component awaits /me before it can render or redirect.
export default function ClientDashboardLoading() {
  return <SkeletonPage />
}
