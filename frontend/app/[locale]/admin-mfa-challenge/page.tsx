import { redirect } from "@/i18n/navigation"
import { auth } from "@clerk/nextjs/server"
import { axios, authHeader } from "@/lib/api"
import type { AppLocale } from "@/i18n/routing"
import { isAdminRole } from "@/lib/adminRoles"
import AdminMfaChallengeClient from "./AdminMfaChallengeClient"

// Server-side gate, independent of the middleware's coarse Clerk-claim
// check — re-derives role, mfaEnrolled, and mfaSessionVerified from our
// own DB/Redis so a non-admin account can never reach this, an unenrolled
// admin is sent to enroll first, and an admin whose session is already
// verified (e.g. they navigated back here directly) is sent straight to
// their dashboard instead of being asked to verify twice.
export default async function AdminMfaChallengePage({
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
    if (!isAdminRole(me.role)) redirect({ href: "/dashboard", locale })
    if (!me.mfaEnrolled) redirect({ href: "/admin-mfa-setup", locale })
    if (me.mfaSessionVerified) redirect({ href: "/admin-dashboard", locale })
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    redirect({ href: "/sign-in", locale })
  }

  return <AdminMfaChallengeClient />
}
