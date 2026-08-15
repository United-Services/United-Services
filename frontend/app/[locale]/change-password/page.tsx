import { redirect } from "@/i18n/navigation"
import { auth } from "@clerk/nextjs/server"
import { axios, authHeader } from "@/lib/api"
import type { AppLocale } from "@/i18n/routing"
import ChangePasswordClient from "./ChangePasswordClient"

// Reachable by any role — mustChangePassword is set on any account an
// admin creates or resets (see AdminUsersController), not just admins.
// Re-derives it from our own DB rather than trusting a client-side flag,
// same reasoning as /admin-mfa-setup: an account that's already changed
// its password (mustChangePassword === false) has no reason to be here,
// so it's sent back through the normal role-based redirect instead.
export default async function ChangePasswordPage({
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
    if (!me.mustChangePassword) redirect({ href: "/dashboard", locale })
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error
    redirect({ href: "/sign-in", locale })
  }

  return <ChangePasswordClient />
}
