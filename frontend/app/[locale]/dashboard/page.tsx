import { isAxiosError } from "axios"
import { getTranslations } from "next-intl/server"
import { redirect } from "@/i18n/navigation"
import { auth } from "@clerk/nextjs/server"
import { axios, authHeader } from "@/lib/api"
import type { AppLocale } from "@/i18n/routing"
import { Role } from "@/enums/status.enums"
import { isAdminRole } from "@/lib/adminRoles"
import DashboardLoadError from "./DashboardLoadError"

// The single post-sign-in landing route for every role. Deliberately does
// not trust Clerk's session claims for the routing decision — it calls our
// own backend, which re-derives the role from the User table (see
// docs/BUSINESS_RULES.md: "never trust a role claim without re-checking
// your own DB").
export default async function DashboardRedirectPage({
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
    // Applies to every role — an admin-created or admin-reset account
    // must set a real password before reaching anything else, including
    // (for admins) MFA enrollment/challenge below.
    if (me.mustChangePassword)
      redirect({ href: "/change-password", locale })
    if (isAdminRole(me.role)) {
      if (!me.mfaEnrolled) redirect({ href: "/admin-mfa-setup", locale })
      // Enrollment is a one-time fact about the account; this is a
      // separate, per-sign-in check — an admin/super_admin who enrolled
      // long ago still has to prove the second factor again for *this*
      // session before ever reaching admin data. See docs/BUSINESS_RULES.md.
      if (!me.mfaSessionVerified)
        redirect({ href: "/admin-mfa-challenge", locale })
      redirect({ href: "/admin-dashboard", locale })
    }
    if (me.role === Role.Client)
      redirect({ href: "/client-dashboard", locale })
    if (me.role === Role.Candidate)
      redirect({ href: "/candidate-dashboard", locale })
    redirect({ href: "/application-status", locale })
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error // Next.js redirect() control-flow signal

    // ClerkAuthGuard throws this exact 401 message specifically when the
    // account exists but has been disabled by an admin (never for a
    // genuinely missing/invalid session — see clerk-auth.guard.ts) — Clerk
    // itself has no idea the account is disabled, so redirecting to
    // /sign-in here would just bounce the user straight back to /dashboard
    // in an infinite loop instead of telling them what's actually wrong.
    if (
      isAxiosError(error) &&
      error.response?.status === 401 &&
      error.response?.data?.message === "Account not found or disabled"
    ) {
      redirect({ href: "/account-disabled", locale })
    }

    // Only a genuine 401 from our backend means Clerk's session is no
    // longer valid — that's the one case /sign-in is the right answer.
    // Anything else (network hiccup, backend 5xx) means Clerk still thinks
    // this user is signed in; /sign-in would immediately redirect them
    // straight back here, ping-ponging forever. Render an error instead.
    if (isAxiosError(error) && error.response?.status === 401) {
      redirect({ href: "/sign-in", locale })
    }

    // This catch previously swallowed the error entirely — no log
    // anywhere, backend or frontend, made a genuine failure here
    // undiagnosable from the outside. It runs server-side (this is a
    // Server Component), so this lands in the Next.js server's own
    // terminal, not the browser console or the backend's logs.
    console.error("[/dashboard] failed to resolve role-based redirect:", error)

    const t = await getTranslations({ locale, namespace: "common" })
    return (
      <DashboardLoadError
        message={t("errors.loadFailed")}
        retryLabel={t("errors.retry")}
      />
    )
  }
}
