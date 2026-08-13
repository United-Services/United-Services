"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import CandidateSignup from "@/views/CandidateSignup"
import { useAppNavigate } from "@/lib/navigate"

function CandidateSignupInner() {
  const navigate = useAppNavigate()
  const searchParams = useSearchParams()
  const positionId = searchParams.get("position")
  return <CandidateSignup onNavigate={navigate} positionId={positionId} />
}

export default function CandidateSignupClient() {
  return (
    <Suspense fallback={null}>
      <CandidateSignupInner />
    </Suspense>
  )
}
