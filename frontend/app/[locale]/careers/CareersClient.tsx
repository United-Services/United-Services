"use client"

import Careers, { type OpenPosition } from "@/views/Careers"
import { useAppNavigate } from "@/lib/navigate"

interface Props {
  initialPositions?: OpenPosition[]
}

export default function CareersClient({ initialPositions }: Props) {
  const navigate = useAppNavigate()
  return <Careers onNavigate={navigate} initialPositions={initialPositions} />
}
