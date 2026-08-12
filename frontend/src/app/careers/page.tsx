'use client'

import Careers from '@/views/Careers'
import { useAppNavigate } from '@/lib/navigate'

export default function CareersPage() {
  const navigate = useAppNavigate()
  return <Careers onNavigate={navigate} />
}
