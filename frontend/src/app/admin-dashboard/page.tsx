import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { api, authHeader } from '@/lib/api'
import AdminDashboardClient from './AdminDashboardClient'

// Server-side gate, independent of the middleware's coarse Clerk-claim
// check: re-derives role AND mfaEnrolled from our own DB on every visit, so
// an admin who hasn't completed MFA enrollment can never reach the
// dashboard by navigating here directly. See docs/BUSINESS_RULES.md.
export default async function AdminDashboardPage() {
  const { userId, getToken } = await auth()
  if (!userId) redirect('/sign-in')

  const token = await getToken()
  try {
    const { data: me } = await api.get('/me', { headers: authHeader(token) })
    if (me.role !== 'admin') redirect('/dashboard')
    if (!me.mfaEnrolled) redirect('/admin-mfa-setup')
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error
    redirect('/sign-in')
  }

  return <AdminDashboardClient />
}
