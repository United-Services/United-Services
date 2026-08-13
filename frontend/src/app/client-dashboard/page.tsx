import { redirect } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { api, authHeader } from '@/lib/api'
import ClientDashboardClient from './ClientDashboardClient'

// Server-side gate, independent of the middleware's coarse check —
// re-derives role from our own DB so an admin or candidate account can
// never land on the client portal by navigating here directly.
export default async function ClientDashboardPage() {
  const { userId, getToken } = await auth()
  if (!userId) redirect('/sign-in')

  const token = await getToken()
  try {
    const { data: me } = await api.get('/me', { headers: authHeader(token) })
    if (me.role !== 'client') redirect('/dashboard')
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error
    redirect('/sign-in')
  }

  return <ClientDashboardClient />
}
