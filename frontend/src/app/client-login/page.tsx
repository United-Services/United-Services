'use client'

import ClientLogin from '@/views/ClientLogin'
import { useAppNavigate } from '@/lib/navigate'

export default function ClientLoginPage() {
  const navigate = useAppNavigate()
  return <ClientLogin onNavigate={navigate} onLogin={() => navigate('client-dashboard')} />
}
