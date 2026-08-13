"use client"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import PublicNav from "../components/PublicNav"
import PublicFooter from "../components/PublicFooter"
import { useReveal } from "../hooks/useReveal"
const heroImg = "/images/lux-hero-petroleum.jpg"

interface Props {
  onNavigate: (page: string) => void
}

const PILLAR_KEYS = [
  "technical",
  "regional",
  "integrated",
  "partnership",
] as const

export default function Vision({ onNavigate }: Props) {
  useReveal()
  const t = useTranslations("vision")

  return (
    <div style={{ fontFamily: "Poppins, sans-serif", background: "#fff" }}>
      <PublicNav current="vision" onNavigate={onNavigate} />

      <section
        style={{
          position: "relative",
          height: "60vh",
          minHeight: 420,
          overflow: "hidden",
        }}
      >
        <img
          src={heroImg}
          alt="Industrial pipe corridor"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(15,23,42,0.78)",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: 1260,
            margin: "0 auto",
            padding: "0 28px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            paddingBottom: 72,
          }}
        >
          <h1
            style={{
              fontSize: "clamp(36px, 5vw, 64px)",
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.03em",
              maxWidth: 680,
            }}
          >
            {t("title")}
          </h1>
        </div>
      </section>

      <section style={{ padding: "80px 28px" }}>
        <div style={{ maxWidth: 1260, margin: "0 auto" }}>
          <div
            className="responsive-card-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 48,
              marginBottom: 72,
            }}
          >
            <div
              className="reveal-left"
              style={{
                background: palette.accentLight,
                border: `1px solid #FED7AA`,
                borderRadius: 20,
                padding: "48px 40px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: palette.accent,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: 20,
                }}
              >
                {t("visionLabel")}
              </div>
              <h2
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: palette.navy,
                  letterSpacing: "-0.02em",
                  marginBottom: 20,
                  lineHeight: 1.2,
                }}
              >
                {t("visionTitle")}
              </h2>
              <p
                style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8 }}
              >
                {t("visionBody")}
              </p>
            </div>
            <div
              className="reveal-right"
              style={{
                background: "#F8FAFC",
                border: "1px solid #E2E8F0",
                borderRadius: 20,
                padding: "48px 40px",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: palette.accent,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  fontWeight: 700,
                  marginBottom: 20,
                }}
              >
                {t("missionLabel")}
              </div>
              <h2
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: palette.navy,
                  letterSpacing: "-0.02em",
                  marginBottom: 20,
                  lineHeight: 1.2,
                }}
              >
                {t("missionTitle")}
              </h2>
              <p
                style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8 }}
              >
                {t("missionBody")}
              </p>
            </div>
          </div>

          <div className="reveal">
            <div
              style={{
                fontSize: 11,
                color: palette.accent,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                marginBottom: 40,
                textAlign: "center",
              }}
            >
              {t("pillarsLabel")}
            </div>
            <div
              className="responsive-card-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 20,
              }}
            >
              {PILLAR_KEYS.map((key, i) => (
                <div
                  key={key}
                  className="reveal"
                  style={{
                    background: "#fff",
                    border: "1px solid #E2E8F0",
                    borderRadius: 16,
                    padding: "28px 24px",
                    transitionDelay: `${i * 0.08}s`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 36,
                      fontWeight: 900,
                      color: "#F1F5F9",
                      lineHeight: 1,
                      marginBottom: 16,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: palette.navy,
                      marginBottom: 10,
                    }}
                  >
                    {t(`pillars.${key}.title` as any)}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: palette.muted,
                      lineHeight: 1.7,
                    }}
                  >
                    {t(`pillars.${key}.desc` as any)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
