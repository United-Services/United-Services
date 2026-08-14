import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import createIntlMiddleware from "next-intl/middleware"
import { NextResponse } from "next/server"
import { routing } from "./i18n/routing"

const LOCALE_PREFIX = /^\/(en|ar|zh)(\/|$)/

const isProtectedRoute = createRouteMatcher([
  "/(en|ar|zh)/dashboard(.*)",
  "/(en|ar|zh)/client-dashboard(.*)",
  "/(en|ar|zh)/admin-dashboard(.*)",
  "/(en|ar|zh)/admin-mfa-setup(.*)",
])
const isAdminRoute = createRouteMatcher([
  "/(en|ar|zh)/admin-dashboard(.*)",
  "/(en|ar|zh)/admin-mfa-setup(.*)",
])

const intlMiddleware = createIntlMiddleware(routing)

// First-time visitors always land on the English site (routing.defaultLocale).
// We don't auto-redirect based on geo IP anymore — instead a client-side
// prompt (see components/LanguagePrompt.tsx) asks the visitor whether they'd
// like to switch to their geo-detected language, and only switches on an
// explicit "yes". Every actual data access is independently re-checked
// against our own DB by the backend's ClerkAuthGuard/RolesGuard (see
// docs/BUSINESS_RULES.md) — this layer only exists to keep signed-out or
// wrong-role users from ever rendering a dashboard shell.
export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    const { userId, sessionClaims, redirectToSignIn } = await auth()
    if (!userId) return redirectToSignIn()

    if (
      isAdminRoute(req) &&
      (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role !==
        "admin"
    ) {
      const locale =
        req.nextUrl.pathname.match(LOCALE_PREFIX)?.[1] ?? routing.defaultLocale
      return NextResponse.redirect(new URL(`/${locale}/dashboard`, req.url))
    }
  }

  return intlMiddleware(req)
})

export const config = {
  matcher: [
    "/((?!_next|sitemap\\.xml|robots\\.txt|[^?]*\\.(?:html?|css|js(?!on)|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
}
