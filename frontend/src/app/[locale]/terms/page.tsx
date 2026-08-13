import type { Metadata } from "next"
import TermsClient from "./TermsClient"

export const metadata: Metadata = {
  title: "Terms of Use | United Services Egypt",
  description:
    "The terms governing use of the United Services Egypt website and client/candidate portals.",
}

export default function TermsPage() {
  return <TermsClient />
}
