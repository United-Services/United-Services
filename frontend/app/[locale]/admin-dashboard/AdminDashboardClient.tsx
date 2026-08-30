"use client"

import { useClerk } from "@clerk/nextjs"
import AdminDashboard from "@/views/AdminDashboard"
import { useAppNavigate } from "@/lib/navigate"

interface Props {
  role: string
}

export default function AdminDashboardClient({ role }: Props) {
  const navigate = useAppNavigate()
  const { signOut } = useClerk()
  return (
    <AdminDashboard
      role={role}
      onNavigate={navigate}
      onLogout={() => signOut(() => navigate("home"))}
    />
  )
}
