'use client'

import AdminDashboard from '@/views/AdminDashboard'
import { useAppNavigate } from '@/lib/navigate'

export default function AdminDashboardClient() {
  const navigate = useAppNavigate()
  return <AdminDashboard onNavigate={navigate} onLogout={() => navigate('home')} />
}
