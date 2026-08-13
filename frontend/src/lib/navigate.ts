'use client'

import { useRouter } from 'next/navigation'

export const ROUTES: Record<string, string> = {
  home: '/',
  about: '/about',
  vision: '/vision',
  services: '/services',
  projects: '/projects',
  contact: '/contact',
  careers: '/careers',
  // There is a single unified login/signup (Clerk) for every role — no
  // separate admin login route or button. Post-auth, /dashboard decides
  // where to send the user based on their role in our own DB.
  'client-login': '/sign-in',
  'admin-login': '/sign-in',
  'client-signup': '/sign-up',
  'client-dashboard': '/client-dashboard',
  'candidate-signup': '/candidate-signup',
  'admin-dashboard': '/admin-dashboard',
}

export function useAppNavigate() {
  const router = useRouter()
  return (page: string, param?: string) => {
    const base = ROUTES[page] ?? '/'
    if (page === 'projects' && param) {
      router.push(`${base}?company=${encodeURIComponent(param)}`)
    } else {
      router.push(base)
    }
  }
}
