import { SkeletonPage } from "@/components/Skeleton"

// Same reasoning as app/[locale]/dashboard/loading.tsx — this route's
// server component awaits /me (auth + role/MFA checks) before it can
// render or redirect.
export default function AdminDashboardLoading() {
  return <SkeletonPage />
}
