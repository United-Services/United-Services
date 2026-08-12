'use client'

import Contact from '@/views/Contact'
import { useAppNavigate } from '@/lib/navigate'

export default function ContactPage() {
  const navigate = useAppNavigate()
  return <Contact onNavigate={navigate} />
}
