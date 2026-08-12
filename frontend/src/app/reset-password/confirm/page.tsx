'use client'

import ResetPassword2 from '@/views/ResetPassword2'
import { useAppNavigate } from '@/lib/navigate'

export default function ResetPasswordConfirmPage() {
  const navigate = useAppNavigate()
  return <ResetPassword2 onNavigate={navigate} />
}
