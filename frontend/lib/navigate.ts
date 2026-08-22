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

export function useAppNavigate() {
  const router = useRouter()
  return (page: string, param?: string) => {
    const base = ROUTES[page] ?? "/"
    const paramKey = PARAM_KEY[page]
    if (paramKey && param) {
      router.push(`${base}?${paramKey}=${encodeURIComponent(param)}`)
    } else {
      router.push(base)
    }
  }
}
