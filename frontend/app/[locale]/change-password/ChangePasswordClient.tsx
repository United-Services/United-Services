"use client"

import ChangePassword from "@/views/ChangePassword"
import { useAppNavigate } from "@/lib/navigate"

export default function ChangePasswordClient() {
  const navigate = useAppNavigate()
  return <ChangePassword onNavigate={navigate} />
}
