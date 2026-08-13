'use client'

import Careers from '@/views/Careers'
import { useAppNavigate } from '@/lib/navigate'

export default function CareersClient() {
  const navigate = useAppNavigate()
  return <Careers onNavigate={navigate} />
}
