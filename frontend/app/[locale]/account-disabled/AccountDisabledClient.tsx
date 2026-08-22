"use client"

import { useClerk } from "@clerk/nextjs"
import AccountDisabled from "@/views/AccountDisabled"
import { useAppNavigate } from "@/lib/navigate"

export default function AccountDisabledClient() {
  const navigate = useAppNavigate()
  const { signOut } = useClerk()
  return (
    <AccountDisabled
      onNavigate={navigate}
      onLogout={() => signOut(() => navigate("home"))}
    />
  )
}
