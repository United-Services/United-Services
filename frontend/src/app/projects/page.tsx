'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Projects from '@/views/Projects'
import { useAppNavigate } from '@/lib/navigate'

function ProjectsInner() {
  const navigate = useAppNavigate()
  const searchParams = useSearchParams()
  const company = searchParams.get('company')
  return <Projects onNavigate={navigate} company={company} />
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsInner />
    </Suspense>
  )
}
