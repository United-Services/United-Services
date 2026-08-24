"use client"

import Home, { type ServicePreview } from "@/views/Home"
import { useAppNavigate } from "@/lib/navigate"

interface Props {
  initialServices?: ServicePreview[]
}

export default function HomeClient({ initialServices }: Props) {
  const navigate = useAppNavigate()
  return <Home onNavigate={navigate} initialServices={initialServices} />
}
