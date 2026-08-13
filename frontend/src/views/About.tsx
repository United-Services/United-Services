"use client" /* Header */ /* Story */ /* Certifications */ /* Facility */
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import PublicNav from "../components/PublicNav"
import PublicFooter from "../components/PublicFooter"
import { useReveal } from "../hooks/useReveal"
const worldImg = "/images/LD-02.png"
const weldImg = "/images/bp-plant.jpg"

interface Props {
  onNavigate: (page: string) => void
}

const CERT_KEYS = ["apiQ1", "iso9001", "iso14001", "iso45001", "egpc"] as const
const CERT_CODES: Record<typeof CERT_KEYS[number], string> = {
  apiQ1: "API Q1",
  iso9001: "ISO 9001",
  iso14001: "ISO 14001",
  iso45001: "ISO 45001",
  egpc: "EGPC",
}

export default function About({ onNavigate }: Props) {
  useReveal()
  const t = useTranslations("about")

  const stats = [1, 2, 3, 4].map((n) => ({
    value: t(`facility.stat${n}Value` as any),
    label: t(`facility.stat${n}Label` as any),
  }))

  return (
    <div style={{ fontFamily: "Poppins, sans-serif", background: "#fff" }}>
      <PublicNav current="about" onNavigate={onNavigate} />

      {}
      <section style={{ background: palette.navy, padding: "120px 28px 80px" }}>
        <div style={{ maxWidth: 1260, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: "clamp(36px, 5vw, 64px)",
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.03em",
              maxWidth: 640,
              lineHeight: 1.05,
            }}
          >
            {t("title")}
          </h1>
        </div>
      </section>

      {}
      <section style={{ padding: "80px 28px" }}>
        <div
          className="responsive-card-grid"
          style={{
            maxWidth: 1260,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 72,
            alignItems: "center",
          }}
        >
          <div className="reveal-left">
            <img
              src={worldImg}
              alt="Industrial pipe racking at a processing facility"
              style={{
                width: "100%",
                aspectRatio: "4/3",
                objectFit: "cover",
                borderRadius: 20,
                boxShadow: "0 20px 60px rgba(0,0,0,0.1)",
              }}
            />
          </div>
          <div className="reveal-right">
            <div
              style={{
                fontSize: 11,
                color: palette.accent,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              {t("story.eyebrow")}
            </div>
            <h2
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: palette.navy,
                letterSpacing: "-0.02em",
                marginBottom: 20,
              }}
            >
              {t("story.title")}
            </h2>
            <p
              style={{
                fontSize: 15,
                color: palette.slate,
                lineHeight: 1.8,
                marginBottom: 16,
              }}
            >
              {t("story.p1")}
            </p>
            <p
              style={{
                fontSize: 15,
                color: palette.slate,
                lineHeight: 1.8,
                marginBottom: 16,
              }}
            >
              {t("story.p2")}
            </p>
            <p style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8 }}>
              {t("story.p3")}
            </p>
          </div>
        </div>
      </section>

      {}
      <section style={{ background: "#F8FAFC", padding: "72px 28px" }}>
        <div style={{ maxWidth: 1260, margin: "0 auto" }}>
          <div
            className="reveal"
            style={{ textAlign: "center", marginBottom: 56 }}
          >
            <div
              style={{
                fontSize: 11,
                color: palette.accent,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              {t("certs.eyebrow")}
            </div>
            <h2
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: palette.navy,
                letterSpacing: "-0.02em",
              }}
            >
              {t("certs.title")}
            </h2>
          </div>
          <div
            className="responsive-card-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 16,
            }}
          >
            {CERT_KEYS.map((key, i) => (
              <div
                key={key}
                className="reveal"
                style={{
                  background: "#fff",
                  border: "1px solid #E2E8F0",
                  borderRadius: 16,
                  padding: "28px 20px",
                  textAlign: "center",
                  transitionDelay: `${i * 0.08}s`,
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: palette.accent,
                    marginBottom: 8,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {CERT_CODES[key]}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: palette.navy,
                    marginBottom: 8,
                  }}
                >
                  {t(`certs.${key}.body` as any)}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: palette.muted,
                    lineHeight: 1.6,
                  }}
                >
                  {t(`certs.${key}.detail` as any)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {}
      <section style={{ padding: "72px 28px" }}>
        <div
          className="responsive-card-grid"
          style={{
            maxWidth: 1260,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 72,
            alignItems: "center",
          }}
        >
          <div className="reveal-left">
            <div
              style={{
                fontSize: 11,
                color: palette.accent,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              {t("facility.eyebrow")}
            </div>
            <h2
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: palette.navy,
                letterSpacing: "-0.02em",
                marginBottom: 20,
              }}
            >
              {t("facility.title")}
            </h2>
            <p
              style={{
                fontSize: 15,
                color: palette.slate,
                lineHeight: 1.8,
                marginBottom: 20,
              }}
            >
              {t("facility.body")}
            </p>
            <div
              className="responsive-card-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginTop: 32,
              }}
            >
              {stats.map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: "#F8FAFC",
                    borderRadius: 14,
                    padding: "20px 20px",
                    border: "1px solid #E2E8F0",
                  }}
                >
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 800,
                      color: palette.accent,
                    }}
                  >
                    {s.value}
                  </div>
                  <div
                    style={{ fontSize: 12, color: palette.muted, marginTop: 4 }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="reveal-right">
            <img
              src={weldImg}
              alt="Interior of the USE manufacturing facility with process piping and equipment"
              style={{
                width: "100%",
                aspectRatio: "3/4",
                objectFit: "cover",
                borderRadius: 20,
                boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
              }}
            />
          </div>
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
