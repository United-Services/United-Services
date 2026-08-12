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
  'client-login': '/client-login',
  'client-signup': '/client-signup',
  reset1: '/reset-password',
  reset2: '/reset-password/confirm',
  'client-dashboard': '/client-dashboard',
  'candidate-signup': '/candidate-signup',
  'admin-login': '/admin-login',
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
