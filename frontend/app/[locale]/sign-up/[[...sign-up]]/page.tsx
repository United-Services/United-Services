import { redirect } from "@/i18n/navigation"
import type { AppLocale } from "@/i18n/routing"

// Sign-up now happens through our own custom wizard (/client-signup),
// not Clerk's bare <SignUp/> widget — this route only exists so any
// stale link/bookmark to /sign-up still lands somewhere correct.
// NEXT_PUBLIC_CLERK_SIGN_UP_URL points Clerk's own internal "sign up"
// links (e.g. the one on the <SignIn/> widget) straight at
// /client-signup, so this redirect is a fallback, not the primary path.
export default async function SignUpPage({
  params,
}: {
  params: Promise<{ locale: AppLocale }>
}) {
  const { locale } = await params
  redirect({ href: "/client-signup", locale })
}
