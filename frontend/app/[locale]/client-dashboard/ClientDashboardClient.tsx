"use client"

import { useClerk } from "@clerk/nextjs"
import ClientDashboard from "@/views/ClientDashboard"
import { useAppNavigate } from "@/lib/navigate"

export default function ClientDashboardClient() {
  const navigate = useAppNavigate()
  const { signOut } = useClerk()
  return (
    <ClientDashboard
      onNavigate={navigate}
      onLogout={() => signOut(() => navigate("home"))}
    />
  )
}
