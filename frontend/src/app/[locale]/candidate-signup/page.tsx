import type { Metadata } from 'next'
import CandidateSignupClient from './CandidateSignupClient'

export const metadata: Metadata = {
  title: 'Candidate Registration | United Services Egypt',
  description: 'Apply to join the USE talent pipeline.',
}

export default function CandidateSignupPage() {
  return <CandidateSignupClient />
}
