import { clerkMiddleware } from "@clerk/nextjs/server"
import createIntlMiddleware from "next-intl/middleware"
import { routing } from "./i18n/routing"

const intlMiddleware = createIntlMiddleware(routing)

// First-time visitors always land on the English site (routing.defaultLocale).
// We don't auto-redirect based on geo IP anymore — instead a client-side
// prompt (see components/LanguagePrompt.tsx) asks the visitor whether they'd
// like to switch to their geo-detected language, and only switches on an
// explicit "yes".
//
// No route-matching auth gate here (previously createRouteMatcher-based,
// now removed — see Clerk's deprecation notice: path matching can diverge
// from how Next.js actually routes a request, e.g. this list never even
// included /candidate-dashboard). Every actual data access is independently
// re-checked against our own DB by the backend's ClerkAuthGuard/RolesGuard,
// and every dashboard/admin-mfa-setup page.tsx already does its own
// server-side auth()+role re-check and redirect before rendering (see
// docs/BUSINESS_RULES.md) — that per-page check was always the real gate;
// this file only ever added a redundant, incompletely-covered pre-filter.
// intlMiddleware only ever makes sense for page routes — it exists to
// resolve/redirect to a locale-prefixed path. Running it against
// /internal-log (browser-side Betterstack log shipping — see
// instrumentation-client.ts) or /api/* rewrites the request to a
// locale-prefixed path that doesn't exist there (e.g. /en/internal-log),
// which 404s since these routes intentionally live outside app/[locale].
// The "/(api|trpc)(.*)" matcher entry below is Clerk's, not next-intl's
// — it needs every request (API routes included) to run through
// clerkMiddleware for auth context, but that doesn't mean intlMiddleware
// should also run on them. (/api/* itself is proxied straight to the
// backend container by nginx/nginx.conf's `location /api/` and never
// actually reaches this app at all in the real deployment — this
// exclusion only matters for whatever hits this middleware directly,
// e.g. local `next dev` with no nginx in front.)
const NON_PAGE_PATHS = ["/api/", "/internal-log"]

export default clerkMiddleware((_auth, req) => {
  const { pathname } = req.nextUrl
  if (NON_PAGE_PATHS.some((p) => pathname.startsWith(p))) return
  return intlMiddleware(req)
})

export const config = {
  matcher: [
    "/((?!_next|sitemap\\.xml|robots\\.txt|[^?]*\\.(?:html?|css|js(?!on)|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
}
