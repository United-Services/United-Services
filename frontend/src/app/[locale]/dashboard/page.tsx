import { redirect } from "@/i18n/navigation"
import { auth } from "@clerk/nextjs/server"
import { axios, authHeader } from "@/lib/api"
import type { AppLocale } from "@/i18n/routing"
import { Role } from "@/enums/status.enums"

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
    redirect({ href: "/sign-in", locale })
  }
}
