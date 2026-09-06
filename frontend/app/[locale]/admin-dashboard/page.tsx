import { redirect } from "@/i18n/navigation"
import { auth } from "@clerk/nextjs/server"
import { axios, authHeader } from "@/lib/api"
import type { AppLocale } from "@/i18n/routing"
import { isAdminRole } from "@/lib/adminRoles"
import AdminDashboardClient from "./AdminDashboardClient"

// Server-side gate, independent of the middleware's coarse Clerk-claim
// check: re-derives role, mfaEnrolled, AND mfaSessionVerified from our own
// DB/Redis on every visit, so an admin/super_admin who hasn't completed
// MFA enrollment — or who has, but hasn't verified the second factor for
// *this* sign-in yet — can never reach the dashboard by navigating here
// directly. See docs/BUSINESS_RULES.md.
export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}) {
  const { locale } = await params
  const { userId, getToken } = await auth()
  if (!userId) redirect({ href: "/sign-in", locale })

  const token = await getToken()
  // The try/catch exists only to turn a failed /me fetch into a sign-in
  // redirect. The JSX is deliberately returned OUTSIDE it: React renders
  // components lazily, so a `return <Component />` inside a try block
  // never has its render errors caught by that catch anyway — the
  // catch would silently swallow nothing while looking like it handled
  // something (react-hooks/error-boundaries). Render errors are the
  // job of app/[locale]/error.tsx, the real error boundary.
  let role: string
  try {
    const { data: me } = await axios.get("/me", { headers: authHeader(token) })
    if (!isAdminRole(me.role)) redirect({ href: "/dashboard", locale })
    if (!me.mfaEnrolled) redirect({ href: "/admin-mfa-setup", locale })
    if (!me.mfaSessionVerified)
      redirect({ href: "/admin-mfa-challenge", locale })
    role = me.role
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    redirect({ href: "/sign-in", locale })
    // redirect() throws NEXT_REDIRECT, so this is unreachable at runtime.
    // It exists because tsc types next-intl's redirect via the client
    // entry (returns void), not the react-server one (returns never), so
    // without it control-flow analysis can't see the catch never falls
    // through to the `role` read below.
    throw error
  }

  // Passed down rather than re-fetched client-side — this request
  // already has it, and AdminDashboard uses it purely for conditional
  // rendering (audit log / tickets nav + sections are super_admin-only —
  // see views/AdminDashboard.tsx). The backend is the real boundary:
  // AuditLogController/TicketsController reject a plain admin
  // regardless of what this prop says.
  return <AdminDashboardClient role={role} />
}
