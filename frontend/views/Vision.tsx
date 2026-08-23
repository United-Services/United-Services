"use client"
import { useTranslations } from "next-intl"
import Image from "next/image"
import PublicNav from "../components/PublicNav"
import PublicFooter from "../components/PublicFooter"
import { useReveal } from "../hooks/useReveal"
import { INK, PAPER, TEXT, MUTED, LIME, HEAD, BODY, PublicTag } from "../lib/publicTheme"
import dynamic from "next/dynamic"
// See views/About.tsx for why this is dynamic — same heavy, WebGL-only,
// purely decorative dependency.
const ParticleField = dynamic(() => import("../components/three/ParticleField"), { ssr: false })
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
    <div style={{ fontFamily: BODY, background: PAPER, color: TEXT }}>
      <PublicNav current="vision" onNavigate={onNavigate} />

      <section
        style={{
          position: "relative",
          height: "60vh",
          minHeight: 420,
          overflow: "hidden",
          background: INK,
        }}
      >
        <Image
          src={heroImg}
          alt="Industrial pipe corridor"
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to top, rgba(10,10,12,0.88) 0%, rgba(10,10,12,0.35) 60%)",
          }}
        />
        <ParticleField color={LIME} count={140} style={{ zIndex: 1 }} />
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
              fontFamily: HEAD,
              fontSize: "clamp(36px, 5vw, 64px)",
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.02em",
              maxWidth: 680,
            }}
          >
            {t("title")}
          </h1>
        </div>
      </section>

      <section style={{ padding: "90px 28px" }}>
        <div style={{ maxWidth: 1260, margin: "0 auto" }}>
          <div
            className="responsive-card-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 24,
              marginBottom: 72,
            }}
          >
            <div
              className="reveal-left"
              style={{
                background: LIME,
                borderRadius: 20,
                padding: "48px 40px",
              }}
            >
              <PublicTag>{t("visionLabel")}</PublicTag>
              <h2
                style={{
                  fontFamily: HEAD,
                  fontSize: 28,
                  fontWeight: 600,
                  color: TEXT,
                  letterSpacing: "-0.01em",
                  margin: "20px 0",
                  lineHeight: 1.2,
                }}
              >
                {t("visionTitle")}
              </h2>
              <p style={{ fontSize: 15, color: "#2c2e18", lineHeight: 1.8 }}>
                {t("visionBody")}
              </p>
            </div>
            <div
              className="reveal-right"
              style={{
                background: "#fff",
                border: "1px solid #E6E5E0",
                borderRadius: 20,
                padding: "48px 40px",
              }}
            >
              <PublicTag>{t("missionLabel")}</PublicTag>
              <h2
                style={{
                  fontFamily: HEAD,
                  fontSize: 28,
                  fontWeight: 600,
                  color: TEXT,
                  letterSpacing: "-0.01em",
                  margin: "20px 0",
                  lineHeight: 1.2,
                }}
              >
                {t("missionTitle")}
              </h2>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.8 }}>
                {t("missionBody")}
              </p>
            </div>
          </div>

          <div className="reveal">
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <PublicTag>{t("pillarsLabel")}</PublicTag>
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
                    border: "1px solid #E6E5E0",
                    borderRadius: 16,
                    padding: "28px 24px",
                    transitionDelay: `${i * 0.08}s`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: HEAD,
                      fontSize: 36,
                      fontWeight: 700,
                      color: "#E6E5E0",
                      lineHeight: 1,
                      marginBottom: 16,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div
                    style={{
                      fontFamily: HEAD,
                      fontSize: 16,
                      fontWeight: 600,
                      color: TEXT,
                      marginBottom: 10,
                    }}
                  >
                    {t(`pillars.${key}.title` as any)}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: MUTED,
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
