import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/client-dashboard(.*)",
  "/admin-dashboard(.*)",
]);
const isAdminRoute = createRouteMatcher(["/admin-dashboard(.*)"]);

// Coarse, fast gating at the edge — every actual data access is
// independently re-checked against our own DB by the backend's
// ClerkAuthGuard/RolesGuard (see docs/BUSINESS_RULES.md). This layer only
// exists to keep signed-out or wrong-role users from ever rendering a
// dashboard shell.
export default clerkMiddleware(async (auth, req) => {
  if (!isProtectedRoute(req)) return;

  const { userId, sessionClaims, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  if (isAdminRoute(req) && (sessionClaims?.publicMetadata as { role?: string } | undefined)?.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
