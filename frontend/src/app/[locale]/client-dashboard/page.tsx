import { redirect } from "@/i18n/navigation"
import { auth } from "@clerk/nextjs/server"
import { api, authHeader } from "@/lib/api"
import type { AppLocale } from "@/i18n/routing"
import ClientDashboardClient from "./ClientDashboardClient"

// Server-side gate, independent of the middleware's coarse check —
// re-derives role from our own DB so an admin or candidate account can
// never land on the client portal by navigating here directly.
export default async function ClientDashboardPage({
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
    if (me.role !== "client") redirect({ href: "/dashboard", locale })
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    redirect({ href: "/sign-in", locale })
  }

  return <ClientDashboardClient />
}
