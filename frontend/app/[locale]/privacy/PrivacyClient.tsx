"use client"

import LegalPage from "@/views/LegalPage"
import { useAppNavigate } from "@/lib/navigate"

const SECTION_KEYS = [
  "dataCollected",
  "howWeUseIt",
  "legalBasis",
  "sharing",
  "cookies",
  "retention",
  "security",
  "yourRights",
  "children",
  "changes",
  "contact",
]

export default function PrivacyClient() {
  const navigate = useAppNavigate()
  return <LegalPage onNavigate={navigate} namespace="privacy" sectionKeys={SECTION_KEYS} />
}
