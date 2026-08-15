"use client" /* Info */ /* Map */
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import PublicNav from "../components/PublicNav"
import PublicFooter from "../components/PublicFooter"

interface Props {
  onNavigate: (page: string) => void
}

export default function Contact({ onNavigate }: Props) {
  const t = useTranslations("contact")

  const contactCards = [
    {
      icon: "📍",
      label: t("info.headquarters"),
      value: t("info.headquartersValue"),
    },
    {
      icon: "✉️",
      label: t("info.email"),
      value: "info@use-eg.com",
      href: "mailto:info@use-eg.com",
    },
    {
      icon: "📞",
      label: t("info.tel"),
      value: "(+2) 0227033656",
      href: "tel:+20227033656",
    },
    {
      icon: "🌍",
      label: t("info.operations"),
      value: t("info.operationsValue"),
    },
  ]

  return (
    <div style={{ fontFamily: "Poppins, sans-serif", background: "#fff" }}>
      <PublicNav current="contact" onNavigate={onNavigate} />
      <div style={{ height: 68 }} />

      <section style={{ padding: "72px 28px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: 42,
              fontWeight: 800,
              color: palette.navy,
              letterSpacing: "-0.03em",
              marginBottom: 20,
              lineHeight: 1.1,
            }}
          >
            {t("title")}
          </h1>
          <p
            style={{
              fontSize: 15,
              color: palette.slate,
              lineHeight: 1.8,
              marginBottom: 40,
            }}
          >
            {t("subtitle")}
          </p>

          {}
          <div
            style={{
              background: palette.accentLight,
              border: `1px solid ${palette.border}`,
              borderRadius: 20,
              padding: "24px 28px",
              marginBottom: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: palette.navy,
                  marginBottom: 4,
                }}
              >
                {t("servicePrompt.title")}
              </div>
              <div style={{ fontSize: 13, color: palette.slate }}>
                {t("servicePrompt.body")}
              </div>
            </div>
            <button
              onClick={() => onNavigate("client-login")}
              style={{
                background: palette.accent,
                color: "#fff",
                border: "none",
                borderRadius: 9999,
                padding: "12px 26px",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {t("servicePrompt.cta")}
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {contactCards.map((c) => (
              <div
                key={c.label}
                style={{ display: "flex", gap: 14, alignItems: "flex-start" }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: palette.accentLight,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  {c.icon}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      color: palette.muted,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {c.label}
                  </div>
                  {c.href ? (
                    <a
                      href={c.href}
                      style={{
                        fontSize: 14,
                        color: palette.navy,
                        fontWeight: 600,
                        marginTop: 2,
                        display: "block",
                        textDecoration: "none",
                      }}
                    >
                      {c.value}
                    </a>
                  ) : (
                    <div
                      style={{
                        fontSize: 14,
                        color: palette.navy,
                        fontWeight: 600,
                        marginTop: 2,
                      }}
                    >
                      {c.value}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {}
          <a
            href="https://maps.app.goo.gl/hfusekSTTf62MYTb9?g_st=ic"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              marginTop: 32,
              borderRadius: 20,
              overflow: "hidden",
              border: `1px solid ${palette.border}`,
              position: "relative",
            }}
          >
            <iframe
              title={t("mapAlt")}
              src="https://maps.google.com/maps?q=29.982695,31.272598&z=16&output=embed"
              width="100%"
              height="260"
              style={{ border: 0, display: "block", pointerEvents: "none" }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
            <div
              style={{
                position: "absolute",
                bottom: 12,
                right: 12,
                background: "#fff",
                borderRadius: 9999,
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 700,
                color: palette.accent,
                boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              }}
            >
              {t("openInMaps")}
            </div>
          </a>
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
