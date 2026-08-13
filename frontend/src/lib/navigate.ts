'use client'

import { useRouter } from '@/i18n/navigation'

export const ROUTES: Record<string, string> = {
  home: '/',
  about: '/about',
  vision: '/vision',
  services: '/services',
  projects: '/projects',
  contact: '/contact',
  careers: '/careers',
  // There is a single unified login for every role — no separate admin
  // login route or button. Post-auth, /dashboard decides where to send
  // the user based on their role in our own DB.
  'client-login': '/sign-in',
  'admin-login': '/sign-in',
  'client-signup': '/client-signup',
  'client-dashboard': '/client-dashboard',
  'candidate-signup': '/candidate-signup',
  'admin-dashboard': '/admin-dashboard',
  'admin-mfa-setup': '/admin-mfa-setup',
}

// Pages that accept an optional param carry it as this query key.
const PARAM_KEY: Record<string, string> = {
  projects: 'company',
  'candidate-signup': 'position',
}

export function useAppNavigate() {
  const router = useRouter()
  return (page: string, param?: string) => {
    const base = ROUTES[page] ?? '/'
    const paramKey = PARAM_KEY[page]
    if (paramKey && param) {
      router.push(`${base}?${paramKey}=${encodeURIComponent(param)}`)
    } else {
      router.push(base)
    }
  }
}
