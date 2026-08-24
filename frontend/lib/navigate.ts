"use client"
// There is a single unified login for every role — no separate admin
// login route or button. Post-auth, /dashboard decides where to send
// the user based on their role in our own DB.

// Pages that accept an optional param carry it as this query key.
import { useRouter } from "@/i18n/navigation"

export const ROUTES: Record<string, string> = {
  home: "/",
  about: "/about",
  vision: "/vision",
  services: "/services",
  projects: "/projects",
  contact: "/contact",
  careers: "/careers",
  dashboard: "/dashboard",
  "client-login": "/sign-in",
  "admin-login": "/sign-in",
  "client-signup": "/client-signup",
  "client-dashboard": "/client-dashboard",
  "candidate-signup": "/candidate-signup",
  "candidate-dashboard": "/candidate-dashboard",
  "admin-dashboard": "/admin-dashboard",
  "admin-mfa-setup": "/admin-mfa-setup",
  "admin-mfa-challenge": "/admin-mfa-challenge",
  "change-password": "/change-password",
  privacy: "/privacy",
  terms: "/terms",
  tickets: "/tickets",
  "account-disabled": "/account-disabled",
}
const PARAM_KEY: Record<string, string> = {
  projects: "company",
  "candidate-signup": "position",
  tickets: "type",
}

function resolveHref(page: string, param?: string): string {
  const base = ROUTES[page] ?? "/"
  const paramKey = PARAM_KEY[page]
  return paramKey && param
    ? `${base}?${paramKey}=${encodeURIComponent(param)}`
    : base
}

export function useAppNavigate() {
  const router = useRouter()
  return (page: string, param?: string) => {
    router.push(resolveHref(page, param))
  }
}

// Prefetch the route's RSC payload on hover/focus, before the click happens,
// so the navigation triggered by useAppNavigate() lands instantly instead of
// waiting on the fetch. Pair with useAppNavigate() on the same trigger:
// `onMouseEnter={prefetchOnHover("services")}`.
export function usePrefetchOnHover() {
  const router = useRouter()
  return (page: string, param?: string) => () => {
    router.prefetch(resolveHref(page, param))
  }
}
