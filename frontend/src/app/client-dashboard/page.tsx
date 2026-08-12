'use client'

import ClientDashboard from '@/views/ClientDashboard'
import { useAppNavigate } from '@/lib/navigate'

export default function ClientDashboardPage() {
  const navigate = useAppNavigate()
  return <ClientDashboard onNavigate={navigate} onLogout={() => navigate('home')} />
}
