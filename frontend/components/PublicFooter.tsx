"use client" /* Brand */ /* Company */ /* Services */ /* Contact */
import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { axios } from "../lib/api"
import { INK, LIME, HEAD, BODY } from "../lib/publicTheme"
const footerLogo = "/images/logo-footer.webp"

interface Props {
  onNavigate: (page: string) => void
}

interface FooterService {
  id: string
  name: string
}

const CERTS = [
  "API Q1",
  "ISO 9001 · DNV",
  "ISO 14001",
  "ISO 45001",
  "EGPC Registered",
]
const COMPANY_LINKS = ["about", "vision", "careers", "contact"] as const

export default function PublicFooter({ onNavigate }: Props) {
  const t = useTranslations("footer")
  const tNav = useTranslations("nav")
  const locale = useLocale()
  const [services, setServices] = useState<FooterService[]>([])

  useEffect(() => {
    axios
      .get("/services", { params: locale !== "en" ? { locale } : undefined })
      .then(({ data }) => setServices(data))
      .catch(() => undefined)
  }, [locale])

  return (
    <footer
      style={{
        background: INK,
        color: "#fff",
        padding: "64px 28px 32px",
        fontFamily: BODY,
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
                loading="lazy"
                style={{ height: 48, width: "auto", objectFit: "contain" }}
              />
            </div>
            <p
              style={{
                fontSize: 14,
                color: "#A9A9A9",
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
                    color: LIME,
                    background: "rgba(216,255,62,0.1)",
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
                fontSize: 11,
                fontWeight: 600,
                color: "#6f6f6b",
                letterSpacing: "0.08em",
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
                  color: "#A9A9A9",
                  fontSize: 14,
                  padding: "6px 0",
                  fontFamily: BODY,
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
                fontSize: 11,
                fontWeight: 600,
                color: "#6f6f6b",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              {t("servicesHeading")}
            </div>
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => onNavigate("services")}
                style={{
                  display: "block",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#A9A9A9",
                  fontSize: 13,
                  padding: "5px 0",
                  fontFamily: BODY,
                  textAlign: "start",
                }}
              >
                {s.name}
              </button>
            ))}
          </div>

          {}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#6f6f6b",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              {t("contactHeading")}
            </div>
            <div style={{ fontSize: 13, color: "#A9A9A9", lineHeight: 1.8 }}>
              <div>14S Building, El Oroba Street Extension</div>
              <div style={{ color: "#6f6f6b", fontSize: 12, marginBottom: 8 }}>
                New Maadi, Cairo, Egypt
              </div>
              <a
                href="tel:+20227033656"
                style={{
                  display: "block",
                  color: "#A9A9A9",
                  textDecoration: "none",
                }}
              >
                {t("tel")}: (+2) 0227033656
              </a>
              <div style={{ color: "#6f6f6b", fontSize: 12, marginBottom: 8 }}>
                {t("fax")}: (+2) 0227033656
              </div>
              <a
                href="mailto:info@use-eg.com"
                style={{ color: LIME, textDecoration: "none" }}
              >
                info@use-eg.com
              </a>
              <div style={{ marginTop: 16, fontSize: 12, color: "#6f6f6b" }}>
                {t("alsoOperatingIn")}
              </div>
              <div style={{ fontSize: 12, color: "#A9A9A9" }}>
                {t("operatingRegions")}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: 28,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div style={{ fontSize: 13, color: "#6f6f6b", fontFamily: HEAD }}>{t("copyright")}</div>
          <div style={{ display: "flex", gap: 24 }}>
            <button
              onClick={() => onNavigate("tickets")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "#6f6f6b",
                fontFamily: BODY,
                padding: 0,
              }}
            >
              {t("reportProblem")}
            </button>
            <button
              onClick={() => onNavigate("privacy")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                color: "#6f6f6b",
                fontFamily: BODY,
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
                color: "#6f6f6b",
                fontFamily: BODY,
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
