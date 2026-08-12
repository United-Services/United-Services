'use client'

import Services from '@/views/Services'
import { useAppNavigate } from '@/lib/navigate'

export default function ServicesPage() {
  const navigate = useAppNavigate()
  return <Services onNavigate={navigate} />
}
