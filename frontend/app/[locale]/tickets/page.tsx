import type { Metadata } from "next"
import TicketsClient from "./TicketsClient"

export const metadata: Metadata = {
  title: "Report a Problem | United Services Egypt",
  description: "Report a technical issue, a disabled-account mistake, or any other problem.",
}

export default function TicketsPage() {
  return <TicketsClient />
}
