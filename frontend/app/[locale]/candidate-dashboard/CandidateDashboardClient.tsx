"use client"

import { useClerk } from "@clerk/nextjs"
import CandidateDashboard from "@/views/CandidateDashboard"
import { useAppNavigate } from "@/lib/navigate"

export default function CandidateDashboardClient() {
  const navigate = useAppNavigate()
  const { signOut } = useClerk()
  return (
    <CandidateDashboard
      onNavigate={navigate}
      onLogout={() => signOut(() => navigate("home"))}
    />
  )
}
