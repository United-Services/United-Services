"use client" /* Brand */ /* Company */ /* Services */ /* Contact */
import { useTranslations } from "next-intl"
import { palette } from "../theme"
const footerLogo = "/images/logo-footer.png"

interface Props {
  onNavigate: (page: string) => void
}

const CERTS = [
  "API Q1",
  "ISO 9001 · DNV",
  "ISO 14001",
  "ISO 45001",
  "EGPC Registered",
]
const COMPANY_LINKS = ["about", "vision", "careers", "contact"] as const
const SERVICE_KEYS = ["gre", "wrap", "coating", "hdpe", "rtp", "rtv"] as const

export default function PublicFooter({ onNavigate }: Props) {
  const t = useTranslations("footer")
  const tNav = useTranslations("nav")
  const tSvc = useTranslations("services.names")

  return (
    <footer
      style={{
        background: palette.navy,
        color: "#fff",
        padding: "64px 28px 32px",
      }}
    >
      <div style={{ maxWidth: 1260, margin: "0 auto" }}>
        <div
          className="responsive-card-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr 1fr",
            gap: 48,
            marginBottom: 56,
          }}
        >
          {}
          <div>
            <div style={{ marginBottom: 20 }}>
              <img
                src={footerLogo}
                alt="United Services Egypt"
                style={{ height: 48, width: "auto", objectFit: "contain" }}
              />
            </div>
            <p
              style={{
                fontSize: 14,
                color: "#94A3B8",
                lineHeight: 1.7,
                maxWidth: 300,
                marginBottom: 24,
              }}
            >
              {t("tagline")}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {CERTS.map((c) => (
                <span
                  key={c}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: palette.accent,
                    background: "rgba(234,88,12,0.12)",
                    borderRadius: 6,
                    padding: "4px 10px",
                    letterSpacing: "0.04em",
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {}
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#64748B",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              {t("companyHeading")}
            </div>
            {COMPANY_LINKS.map((p) => (
              <button
                key={p}
                onClick={() => onNavigate(p)}
                style={{
                  display: "block",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#CBD5E1",
                  fontSize: 14,
                  padding: "6px 0",
                  fontFamily: "Poppins, sans-serif",
                }}
              >
                {tNav(p)}
              </button>
            ))}
          </div>

          {}
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#64748B",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              {t("servicesHeading")}
            </div>
            {SERVICE_KEYS.map((s) => (
              <button
                key={s}
                onClick={() => onNavigate("services")}
                style={{
                  display: "block",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#CBD5E1",
                  fontSize: 13,
                  padding: "5px 0",
                  fontFamily: "Poppins, sans-serif",
                  textAlign: "start",
                }}
              >
                {tSvc(s)}
              </button>
            ))}
          </div>

          {}
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#64748B",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              {t("contactHeading")}
            </div>
            <div style={{ fontSize: 13, color: "#CBD5E1", lineHeight: 1.8 }}>
              <div>14S Building, El Oroba Street Extension</div>
              <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 8 }}>
                New Maadi, Cairo, Egypt
              </div>
              <a
                href="tel:+20227033656"
                style={{
                  display: "block",
                  color: "#CBD5E1",
                  textDecoration: "none",
                }}
              >
                {t("tel")}: (+2) 0227033656
              </a>
              <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 8 }}>
                {t("fax")}: (+2) 0227033656
              </div>
              <a
                href="mailto:info@use-eg.com"
                style={{ color: palette.accent, textDecoration: "none" }}
              >
                info@use-eg.com
              </a>
              <div style={{ marginTop: 16, fontSize: 12, color: "#64748B" }}>
                {t("alsoOperatingIn")}
              </div>
              <div style={{ fontSize: 12, color: "#94A3B8" }}>
                {t("operatingRegions")}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid #1E293B",
            paddingTop: 28,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div style={{ fontSize: 13, color: "#475569" }}>{t("copyright")}</div>
          <div style={{ display: "flex", gap: 24 }}>
            <button
              onClick={() => onNavigate("privacy")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "#475569",
                fontFamily: "Poppins, sans-serif",
                padding: 0,
              }}
            >
              {t("privacyPolicy")}
            </button>
            <button
              onClick={() => onNavigate("terms")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "#475569",
                fontFamily: "Poppins, sans-serif",
                padding: 0,
              }}
            >
              {t("termsOfService")}
            </button>
          </div>
        </div>
      </div>
    </footer>
  )
}
