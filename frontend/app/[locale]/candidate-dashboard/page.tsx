import { redirect } from "@/i18n/navigation"
import { auth } from "@clerk/nextjs/server"
import { axios, authHeader } from "@/lib/api"
import type { AppLocale } from "@/i18n/routing"
import { Role } from "@/enums/status.enums"
import CandidateDashboardClient from "./CandidateDashboardClient"

// Server-side gate, independent of the middleware's coarse check —
// re-derives role from our own DB so a client or admin account can never
// land on the candidate portal by navigating here directly.
export default async function CandidateDashboardPage({
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
    if (me.role !== Role.Candidate) redirect({ href: "/dashboard", locale })
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    redirect({ href: "/sign-in", locale })
  }

  return <CandidateDashboardClient />
}
