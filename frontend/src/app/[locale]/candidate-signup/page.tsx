'use client'

import CandidateSignup from '@/views/CandidateSignup'
import { useAppNavigate } from '@/lib/navigate'

export default function CandidateSignupPage() {
  const navigate = useAppNavigate()
  return <CandidateSignup onNavigate={navigate} />
}
