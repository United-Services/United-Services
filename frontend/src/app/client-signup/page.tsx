'use client'

import ClientSignup from '@/views/ClientSignup'
import { useAppNavigate } from '@/lib/navigate'

export default function ClientSignupPage() {
  const navigate = useAppNavigate()
  return <ClientSignup onNavigate={navigate} onSignup={() => navigate('client-dashboard')} />
}
