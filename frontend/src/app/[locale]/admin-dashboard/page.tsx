import { redirect } from "@/i18n/navigation"
import { auth } from "@clerk/nextjs/server"
import { api, authHeader } from "@/lib/api"
import type { AppLocale } from "@/i18n/routing"
import AdminDashboardClient from "./AdminDashboardClient"

// Server-side gate, independent of the middleware's coarse Clerk-claim
// check: re-derives role AND mfaEnrolled from our own DB on every visit, so
// an admin who hasn't completed MFA enrollment can never reach the
// dashboard by navigating here directly. See docs/BUSINESS_RULES.md.
export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}) {
  const { locale } = await params
  const { userId, getToken } = await auth()
  if (!userId) redirect({ href: "/sign-in", locale })

  const token = await getToken()
  try {
    const { data: me } = await api.get("/me", { headers: authHeader(token) })
    if (me.role !== "admin") redirect({ href: "/dashboard", locale })
    if (!me.mfaEnrolled) redirect({ href: "/admin-mfa-setup", locale })
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    redirect({ href: "/sign-in", locale })
  }

  return <AdminDashboardClient />
}
