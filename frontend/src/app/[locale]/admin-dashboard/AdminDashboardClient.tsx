'use client'

import { useClerk } from '@clerk/nextjs'
import AdminDashboard from '@/views/AdminDashboard'
import { useAppNavigate } from '@/lib/navigate'

export default function AdminDashboardClient() {
  const navigate = useAppNavigate()
  const { signOut } = useClerk()
  return <AdminDashboard onNavigate={navigate} onLogout={() => signOut(() => navigate('home'))} />
}
