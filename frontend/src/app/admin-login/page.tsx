'use client'

import AdminLogin from '@/views/AdminLogin'
import { useAppNavigate } from '@/lib/navigate'

export default function AdminLoginPage() {
  const navigate = useAppNavigate()
  return <AdminLogin onNavigate={navigate} onLogin={() => navigate('admin-dashboard')} />
}
