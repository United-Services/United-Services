import type { Metadata } from "next"
import CareersClient from "./CareersClient"

export const metadata: Metadata = {
  title: "Careers | United Services Egypt",
  description:
    "Join the team that protects the region's infrastructure. Open engineering, operations, quality, HSE, and commercial roles across Egypt and the Gulf.",
}

export default function CareersPage() {
  return <CareersClient />
}
