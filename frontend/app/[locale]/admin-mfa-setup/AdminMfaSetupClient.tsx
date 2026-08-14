"use client"

import AdminMfaSetup from "@/views/AdminMfaSetup"
import { useAppNavigate } from "@/lib/navigate"

export default function AdminMfaSetupClient() {
  const navigate = useAppNavigate()
  return <AdminMfaSetup onNavigate={navigate} />
}
