"use client"

import LegalPage from "@/views/LegalPage"
import { useAppNavigate } from "@/lib/navigate"

const SECTION_KEYS = [
  "acceptance",
  "accounts",
  "acceptableUse",
  "intellectualProperty",
  "imageLicense",
  "portalContent",
  "disclaimer",
  "liability",
  "termination",
  "governingLaw",
  "changes",
  "contact",
]

export default function TermsClient() {
  const navigate = useAppNavigate()
  return <LegalPage onNavigate={navigate} namespace="terms" sectionKeys={SECTION_KEYS} />
}
