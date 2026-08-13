import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { api, authHeader } from '@/lib/api'

// The single post-sign-in landing route for every role. Deliberately does
// not trust Clerk's session claims for the routing decision — it calls our
// own backend, which re-derives the role from the User table (see
// docs/BUSINESS_RULES.md: "never trust a role claim without re-checking
// your own DB").
export default async function DashboardRedirectPage() {
  const { userId, getToken } = await auth()
  if (!userId) redirect('/sign-in')

  const token = await getToken()

  try {
    const { data: me } = await api.get('/me', { headers: authHeader(token) })
    if (me.role === 'admin') redirect(me.mfaEnrolled ? '/admin-dashboard' : '/admin-mfa-setup')
    if (me.role === 'client') redirect('/client-dashboard')
    redirect('/application-status')
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error // Next.js redirect() control-flow signal
    redirect('/sign-in')
  }
}
