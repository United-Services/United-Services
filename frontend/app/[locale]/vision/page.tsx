import type { Metadata } from "next"
import VisionClient from "./VisionClient"

export const metadata: Metadata = {
  title: "Vision & Mission | United Services Egypt",
  description:
    "Our strategic direction: engineering corrosion out of the region's oil, gas, and power infrastructure through certified, factory-manufactured protection systems.",
}

export default function VisionPage() {
  return <VisionClient />
}
