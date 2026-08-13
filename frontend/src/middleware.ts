import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const LOCALE_PREFIX = /^\/(en|ar|zh)(\/|$)/;

const isProtectedRoute = createRouteMatcher([
  "/(en|ar|zh)/dashboard(.*)",
  "/(en|ar|zh)/client-dashboard(.*)",
  "/(en|ar|zh)/admin-dashboard(.*)",
  "/(en|ar|zh)/admin-mfa-setup(.*)",
]);
const isAdminRoute = createRouteMatcher([
  "/(en|ar|zh)/admin-dashboard(.*)",
  "/(en|ar|zh)/admin-mfa-setup(.*)",
]);

const intlMiddleware = createIntlMiddleware(routing);

async function detectGeoLocale(req: NextRequest): Promise<string | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";
  const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
  try {
    const res = await fetch(`${apiUrl}/geo/locale`, {
      headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { locale?: string };
    return data.locale && routing.locales.includes(data.locale as (typeof routing.locales)[number])
      ? data.locale
      : null;
  } catch {
    return null;
  }
}

// Coarse, fast gating at the edge — every actual data access is
// independently re-checked against our own DB by the backend's
// ClerkAuthGuard/RolesGuard (see docs/BUSINESS_RULES.md). This layer only
// exists to keep signed-out or wrong-role users from ever rendering a
// dashboard shell, and to route first-time visitors to their likely
// language before next-intl's own (Accept-Language-based) negotiation
// would otherwise default them to English.
export default clerkMiddleware(async (auth, req) => {
  const hasLocalePrefix = LOCALE_PREFIX.test(req.nextUrl.pathname);
  const hasLocaleCookie = req.cookies.has("NEXT_LOCALE");

  if (!hasLocalePrefix && !hasLocaleCookie) {
    const geoLocale = await detectGeoLocale(req);
    if (geoLocale && geoLocale !== routing.defaultLocale) {
      const url = req.nextUrl.clone();
      url.pathname = `/${geoLocale}${req.nextUrl.pathname}`;
      const response = NextResponse.redirect(url);
      response.cookies.set("NEXT_LOCALE", geoLocale, { maxAge: 60 * 60 * 24 * 365, path: "/" });
      return response;
    }
  }

  if (isProtectedRoute(req)) {
    const { userId, sessionClaims, redirectToSignIn } = await auth();
    if (!userId) return redirectToSignIn();

    if (isAdminRoute(req) && (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role !== "admin") {
      const locale = req.nextUrl.pathname.match(LOCALE_PREFIX)?.[1] ?? routing.defaultLocale;
      return NextResponse.redirect(new URL(`/${locale}/dashboard`, req.url));
    }
  }

  return intlMiddleware(req);
});

export const config = {
  matcher: [
    "/((?!_next|sitemap\\.xml|robots\\.txt|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
