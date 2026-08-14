import { redirect } from "@/i18n/navigation"
import { auth } from "@clerk/nextjs/server"
import { axios, authHeader } from "@/lib/api"
import type { AppLocale } from "@/i18n/routing"
import { Role } from "@/enums/status.enums"
import AdminMfaSetupClient from "./AdminMfaSetupClient"

// Server-side gate, independent of the middleware's coarse Clerk-claim
// check — re-derives role AND mfaEnrolled from our own DB so a non-admin
// account can never reach the enrollment shell by navigating here
// directly, and an admin who has already enrolled is sent straight to
// their dashboard (further MFA management happens from
// AdminSecuritySection inside it, not here).
export default async function AdminMfaSetupPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}) {
  const { locale } = await params
  const { userId, getToken } = await auth()
  if (!userId) redirect({ href: "/sign-in", locale })

  const token = await getToken()
  try {
    const { data: me } = await axios.get("/me", { headers: authHeader(token) })
    if (me.role !== Role.Admin) redirect({ href: "/dashboard", locale })
    if (me.mfaEnrolled) redirect({ href: "/admin-dashboard", locale })
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    redirect({ href: "/sign-in", locale })
  }

  return <AdminMfaSetupClient />
}
