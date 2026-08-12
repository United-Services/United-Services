'use client'

import Vision from '@/views/Vision'
import { useAppNavigate } from '@/lib/navigate'

export default function VisionPage() {
  const navigate = useAppNavigate()
  return <Vision onNavigate={navigate} />
}
