'use client'

import ResetPassword1 from '@/views/ResetPassword1'
import { useAppNavigate } from '@/lib/navigate'

export default function ResetPasswordPage() {
  const navigate = useAppNavigate()
  return <ResetPassword1 onNavigate={navigate} onNext={() => navigate('reset2')} />
}
