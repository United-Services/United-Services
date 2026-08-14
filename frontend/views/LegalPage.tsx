"use client"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import PublicNav from "../components/PublicNav"
import PublicFooter from "../components/PublicFooter"
import { useReveal } from "../hooks/useReveal"

interface Props {
  onNavigate: (page: string) => void
  namespace: "privacy" | "terms"
  sectionKeys: string[]
}

export default function LegalPage({ onNavigate, namespace, sectionKeys }: Props) {
  useReveal()
  const t = useTranslations(namespace)

  return (
    <div style={{ fontFamily: "Poppins, sans-serif", background: "#fff" }}>
      <PublicNav current={namespace} onNavigate={onNavigate} />

      <section style={{ background: palette.navy, padding: "120px 28px 64px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: "clamp(32px, 4.5vw, 52px)",
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.03em",
              marginBottom: 12,
            }}
          >
            {t("title")}
          </h1>
          <p style={{ fontSize: 14, color: "#94A3B8" }}>{t("lastUpdated")}</p>
        </div>
      </section>

      <section style={{ padding: "64px 28px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <p
            style={{
              fontSize: 15,
              color: palette.slate,
              lineHeight: 1.8,
              marginBottom: 40,
            }}
          >
            {t("intro")}
          </p>
          {sectionKeys.map((key) => (
            <div key={key} className="reveal" style={{ marginBottom: 36 }}>
              <h2
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: palette.navy,
                  marginBottom: 12,
                  letterSpacing: "-0.01em",
                }}
              >
                {t(`sections.${key}.title` as any)}
              </h2>
              <p style={{ fontSize: 14, color: palette.slate, lineHeight: 1.8 }}>
                {t(`sections.${key}.body` as any)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
