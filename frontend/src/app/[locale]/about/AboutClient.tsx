"use client"

import About from "@/views/About"
import { useAppNavigate } from "@/lib/navigate"

export default function AboutClient() {
  const navigate = useAppNavigate()
  return <About onNavigate={navigate} />
}
