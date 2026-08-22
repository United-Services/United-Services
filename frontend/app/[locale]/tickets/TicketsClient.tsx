"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Tickets from "@/views/Tickets"
import { useAppNavigate } from "@/lib/navigate"

function TicketsInner() {
  const navigate = useAppNavigate()
  const searchParams = useSearchParams()
  const type = searchParams.get("type")
  const initialType =
    type === "disabled_account" || type === "technical" || type === "non_technical" ? type : null
  return <Tickets onNavigate={navigate} initialType={initialType} />
}

export default function TicketsClient() {
  return (
    <Suspense fallback={null}>
      <TicketsInner />
    </Suspense>
  )
}
