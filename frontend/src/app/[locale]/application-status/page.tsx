"use client"

import { useTranslations } from "next-intl"
import { palette } from "@/theme"
import PublicNav from "@/components/PublicNav"
import PublicFooter from "@/components/PublicFooter"
import { useAppNavigate } from "@/lib/navigate"

export default function ApplicationStatusPage() {
  const navigate = useAppNavigate()
  const t = useTranslations("applicationStatus")

  return (
    <div style={{ fontFamily: "Poppins, sans-serif", background: "#fff" }}>
      <PublicNav current="" onNavigate={navigate} />
      <div style={{ height: 68 }} />
      <section style={{ padding: "96px 28px", textAlign: "center" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: palette.navy,
              marginBottom: 16,
            }}
          >
            {t("title")}
          </h1>
          <p style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8 }}>
            {t("body")}
          </p>
        </div>
      </section>
      <PublicFooter onNavigate={navigate} />
    </div>
  )
}
