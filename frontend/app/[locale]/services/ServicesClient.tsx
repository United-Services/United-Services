"use client"

import Services, { type Service } from "@/views/Services"
import { useAppNavigate } from "@/lib/navigate"

interface Props {
  initialServices?: Service[]
}

export default function ServicesClient({ initialServices }: Props) {
  const navigate = useAppNavigate()
  return <Services onNavigate={navigate} initialServices={initialServices} />
}
