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
export default clerkMiddleware((_auth, req) => intlMiddleware(req))

export const config = {
  matcher: [
    "/((?!_next|sitemap\\.xml|robots\\.txt|[^?]*\\.(?:html?|css|js(?!on)|json|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
}
