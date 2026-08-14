"use client"

import AdminMfaChallenge from "@/views/AdminMfaChallenge"
import { useAppNavigate } from "@/lib/navigate"

export default function AdminMfaChallengeClient() {
  const navigate = useAppNavigate()
  return <AdminMfaChallenge onNavigate={navigate} />
}
