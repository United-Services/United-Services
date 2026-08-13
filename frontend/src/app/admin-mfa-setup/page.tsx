'use client'

import AdminMfaSetup from '@/views/AdminMfaSetup'
import { useAppNavigate } from '@/lib/navigate'

export default function AdminMfaSetupPage() {
  const navigate = useAppNavigate()
  return <AdminMfaSetup onNavigate={navigate} />
}
