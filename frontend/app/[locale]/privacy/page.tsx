import type { Metadata } from "next"
import PrivacyClient from "./PrivacyClient"

export const metadata: Metadata = {
  title: "Privacy Policy | United Services Egypt",
  description:
    "How United Services Egypt collects, uses, and protects personal data across our website and client/candidate portals.",
}

export default function PrivacyPage() {
  return <PrivacyClient />
}
