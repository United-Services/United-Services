"use client"

import Home from "@/views/Home"
import { useAppNavigate } from "@/lib/navigate"

export default function HomeClient() {
  const navigate = useAppNavigate()
  return <Home onNavigate={navigate} />
}
