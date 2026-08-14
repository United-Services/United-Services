import { isAxiosError } from "axios"
import { getTranslations } from "next-intl/server"
import { redirect } from "@/i18n/navigation"
import { auth } from "@clerk/nextjs/server"
import { axios, authHeader } from "@/lib/api"
import type { AppLocale } from "@/i18n/routing"
import { Role } from "@/enums/status.enums"
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
    if (me.role === Role.Admin)
      redirect({
        href: me.mfaEnrolled ? "/admin-dashboard" : "/admin-mfa-setup",
        locale,
      })
    if (me.role === Role.Client)
      redirect({ href: "/client-dashboard", locale })
    if (me.role === Role.Candidate)
      redirect({ href: "/candidate-dashboard", locale })
    redirect({ href: "/application-status", locale })
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error // Next.js redirect() control-flow signal

    // Only a genuine 401 from our backend means Clerk's session is no
    // longer valid — that's the one case /sign-in is the right answer.
    // Anything else (network hiccup, backend 5xx) means Clerk still thinks
    // this user is signed in; /sign-in would immediately redirect them
    // straight back here, ping-ponging forever. Render an error instead.
    if (isAxiosError(error) && error.response?.status === 401) {
      redirect({ href: "/sign-in", locale })
    }

    const t = await getTranslations({ locale, namespace: "common" })
    return (
      <DashboardLoadError
        message={t("errors.loadFailed")}
        retryLabel={t("errors.retry")}
      />
    )
  }
}
