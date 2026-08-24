"use client" /* Hero */ /* Trusted Partners */ /* About Us */ /* Mission */ /* Our Projects */ /* Our Services (carousel) */ /* Our Clients */ /* Footer CTA */
import { useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import Image from "next/image"
import PublicNav from "../components/PublicNav"
import Hero from "../components/home/Hero"
import dynamic from "next/dynamic"
// See views/About.tsx for why these are dynamic — heavy, WebGL-only,
// purely decorative dependencies.
const ParticleField = dynamic(() => import("../components/three/ParticleField"), { ssr: false })
const RegionGlobe3D = dynamic(() => import("../components/three/RegionGlobe3D"), { ssr: false })
import { useReveal } from "../hooks/useReveal"
import { axios } from "../lib/api"
import { LAYER_STYLE, SERVICE_SLUG_TO_LAYER } from "../lib/pipelineLayers"
import { INK, PAPER, TEXT, MUTED, LIME, HEAD, BODY, PublicTag } from "../lib/publicTheme"

// A genuine cross-section edge — coating layer against the corroded steel
// wall beneath it — actually shows a multi-layer protection system, unlike
// LD-01's dark interior-tunnel shot (moody, but no visible layering) that
// sat here before.
const layerFigImg = "/images/LD-03.png"
const facilityImg = "/images/dc-welder-portrait.jpg"
const projThumb1 = "/images/dc-proj-thumb-1.jpg"
const projThumb2 = "/images/dc-proj-thumb-2.jpg"
const SVC_PHOTOS = [
  "/images/dc-svc-1-pipes.jpg",
  "/images/dc-svc-2-pipeline.jpg",
  "/images/dc-svc-3-refinery.jpg",
  "/images/dc-svc-4-tanks.jpg",
]

const adnocLogo = "/images/adnoc.webp"
const bpLogo = "/images/bp.webp"
const eniLogo = "/images/eni.webp"
const petrobelLogo = "/images/petrobel.webp"
const apacheLogo = "/images/apache.webp"
const bapetcoLogo = "/images/bapetco.webp"
const khaldaLogo = "/images/khalda.webp"
const agibaLogo = "/images/agiba.webp"
const ososcoLogo = "/images/osoco.webp"
const daraLogo = "/images/dara.webp"
const shellLogo = "/images/shell.webp"
const qarunLogo = "/images/qarun.webp"
const qpLogo = "/images/qp.webp"
const westLogo = "/images/west.webp"
const petrosilahLogo = "/images/petrosilah.webp"

interface Props {
  onNavigate: (page: string, param?: string) => void
  // Server-fetched (see app/[locale]/page.tsx) — see Careers.tsx's
  // identical initialPositions prop for the full reasoning.
  initialServices?: ServicePreview[]
}

const LOGO_CLIENTS = [
  { name: "ADNOC", img: adnocLogo },
  { name: "BP", img: bpLogo },
  { name: "ENI", img: eniLogo },
  { name: "Petrobel", img: petrobelLogo },
  { name: "Apache", img: apacheLogo },
  { name: "Bapetco", img: bapetcoLogo },
  { name: "Khalda", img: khaldaLogo },
  { name: "Agiba", img: agibaLogo },
  { name: "OSOCO", img: ososcoLogo },
  { name: "Dara", img: daraLogo },
  { name: "Shell", img: shellLogo },
  { name: "Qarun", img: qarunLogo },
  { name: "QP", img: qpLogo },
  { name: "West", img: westLogo },
  { name: "Petrosilah", img: petrosilahLogo },
]

const CERT_KEYS = ["apiQ1", "iso9001", "iso14001", "iso45001", "egpc"] as const
const CERT_CODES: Record<(typeof CERT_KEYS)[number], string> = {
  apiQ1: "API Q1",
  iso9001: "ISO 9001",
  iso14001: "ISO 14001",
  iso45001: "ISO 45001",
  egpc: "EGPC",
}

export interface ServicePreview {
  id: string
  slug: string
  name: string
  // The real API's shortDescription is already a spec-code line (e.g.
  // "API 15CLT · Internal Corrosion Barrier") — used directly as the
  // carousel's spec tag, no separate hardcoded lookup needed.
  shortDescription: string
  longDescription?: string
  imageUrl?: string
}

// Fallback rotation for the two real services with no clean 1:1 mapping
// to a pipeline cross-section layer (RTP Systems is a pipe product
// category of its own; RTV Insulator Coating protects transmission-line
// insulators, a different domain from a pipeline cross-section entirely)
// — see lib/pipelineLayers.ts's SERVICE_SLUG_TO_LAYER comment.
const FALLBACK_CARD_COLORS = ["#FFF7ED", "#F0FDF4"]

function cardBackground(slug: string, fallbackIndex: number): string {
  const layer = SERVICE_SLUG_TO_LAYER[slug]
  if (layer) {
    return `color-mix(in srgb, ${LAYER_STYLE[layer].color} 12%, white)`
  }
  return FALLBACK_CARD_COLORS[fallbackIndex % FALLBACK_CARD_COLORS.length]
}

export default function Home({ onNavigate, initialServices }: Props) {
  useReveal()
  const t = useTranslations("home")
  const tNav = useTranslations("nav")
  const tFooter = useTranslations("footer")
  const locale = useLocale()
  const arrow = locale === "ar" ? "←" : "→"
  const [services, setServices] = useState<ServicePreview[]>(initialServices ?? [])
  const [svcIndex, setSvcIndex] = useState(0)
  const [clientsProgress, setClientsProgress] = useState(0.15)
  const clientsRef = useRef<HTMLDivElement>(null)
  const skipNextFetch = useRef(initialServices !== undefined)

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false
      return
    }
    axios
      .get("/services", { params: locale !== "en" ? { locale } : undefined })
      .then(({ data }) => setServices(data))
      .catch(() => undefined)
  }, [locale])

  const STATS = [
    { value: "2005", label: t("proof.yearFoundedLabel") },
    { value: "6,000 m²", label: t("proof.facilityLabel") },
    { value: "4", label: t("proof.countriesLabel") },
    { value: "15+", label: t("proof.clientsLabel") },
  ]

  const svcCount = services.length
  const activeSvc = svcCount > 0 ? services[svcIndex % svcCount] : null
  const step = (d: number) => setSvcIndex((i) => (svcCount > 0 ? (i + d + svcCount) % svcCount : 0))

  const onClientsScroll = () => {
    const el = clientsRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const p = max > 0 ? el.scrollLeft / max : 0
    setClientsProgress(0.15 + p * 0.85)
  }

  return (
    <>
      <div style={{ fontFamily: BODY, background: PAPER, color: TEXT }}>
        <PublicNav current="home" onNavigate={onNavigate} transparentOverHero />

        {}
        <header
          style={{ position: "relative", height: "100vh", minHeight: 640, background: INK, overflow: "hidden" }}
        >
          <div style={{ position: "absolute", inset: 0 }}>
            <Hero />
          </div>
          <ParticleField color={LIME} count={220} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "38%",
              background: "linear-gradient(to top, rgba(10,10,12,0.82), rgba(10,10,12,0))",
              pointerEvents: "none",
            }}
          />
          <div
            className="hero-wordmark-row"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              gap: 40,
              padding: "0 40px 44px",
              flexWrap: "wrap",
            }}
          >
            <h1
              style={{
                margin: 0,
                color: "#fff",
                fontFamily: HEAD,
                fontWeight: 700,
                fontSize: "clamp(48px, 9vw, 140px)",
                lineHeight: 0.9,
                letterSpacing: "-0.02em",
              }}
            >
              United Services
              <sup
                style={{
                  fontSize: "0.18em",
                  fontWeight: 500,
                  verticalAlign: "super",
                  marginInlineStart: "0.15em",
                  border: "1.5px solid rgba(255,255,255,0.7)",
                  borderRadius: 9999,
                  padding: "2px 7px",
                }}
              >
                ©
              </sup>
            </h1>
            <div style={{ maxWidth: 350, display: "flex", flexDirection: "column", gap: 20 }}>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.92)", fontSize: 15, lineHeight: 1.65 }}>
                {t("hero.bodyLine1")}{" "}
                <strong style={{ color: "#fff" }}>{t("hero.bodyLine2")}</strong>
              </p>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  onClick={() => onNavigate("services")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "15px 28px",
                    borderRadius: 9999,
                    background: TEXT,
                    color: "#fff",
                    fontFamily: HEAD,
                    fontSize: 14,
                    fontWeight: 500,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {t("hero.ctaServices")}
                </button>
                <button
                  onClick={() => onNavigate("client-login")}
                  aria-label={t("aria.clientLogin")}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 48,
                    height: 48,
                    borderRadius: 9999,
                    background: LIME,
                    color: TEXT,
                    fontSize: 18,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {arrow}
                </button>
              </div>
            </div>
          </div>
        </header>

        {}
        <section style={{ background: PAPER, padding: "72px 40px 24px" }}>
          <div
            className="reveal"
            style={{
              maxWidth: 1280,
              margin: "0 auto",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 40,
              flexWrap: "wrap",
            }}
          >
            <p style={{ margin: 0, maxWidth: 520, fontSize: 19, lineHeight: 1.55 }}>
              Corrosion control and pipeline integrity solutions for the oil &amp; gas
              industry across Egypt, Iraq, Saudi Arabia, and the UAE.
            </p>
            <PublicTag>Trusted Partners</PublicTag>
          </div>
          <div style={{ overflow: "hidden", marginTop: 64 }}>
            <div className="marquee-track" style={{ gap: 64, alignItems: "center" }}>
              {[...LOGO_CLIENTS, ...LOGO_CLIENTS].map((c, i) => (
                <img
                  key={i}
                  src={c.img}
                  alt={c.name}
                  style={{
                    height: 40,
                    width: "auto",
                    maxWidth: 110,
                    objectFit: "contain",
                    flexShrink: 0,
                    opacity: 0.5,
                    filter: "grayscale(100%)",
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        {}
        <section style={{ background: PAPER, padding: "110px 40px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div
              className="responsive-card-grid reveal"
              style={{ display: "grid", gridTemplateColumns: "minmax(160px,1fr) 2.2fr", gap: 40 }}
            >
              <div>
                <PublicTag>About Us</PublicTag>
              </div>
              <h2
                style={{
                  margin: 0,
                  fontFamily: HEAD,
                  fontWeight: 600,
                  fontSize: "clamp(26px, 3vw, 40px)",
                  lineHeight: 1.25,
                  letterSpacing: "-0.01em",
                }}
              >
                Founded in 2005 by petroleum engineers,{" "}
                <span style={{ color: MUTED }}>
                  United Services Egypt closes the gap between
                </span>{" "}
                globally available corrosion-control standards{" "}
                <span style={{ color: MUTED }}>and inconsistent regional application —</span>{" "}
                today serving EGPC, ADNOC, BP, Shell and 15+ majors{" "}
                <span style={{ color: MUTED }}>from its Cairo facility.</span>
              </h2>
            </div>

            <div
              className="responsive-card-grid"
              style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24, marginTop: 96 }}
            >
              {}
              <div
                className="reveal"
                style={{
                  background: "#fff",
                  borderRadius: 24,
                  padding: 32,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 440,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 60, letterSpacing: "-0.02em" }}>
                  2005
                </div>
                <div style={{ fontSize: 15, marginTop: 6 }}>Founded in Cairo · operating in 4 countries</div>
                <div style={{ marginTop: "auto", position: "relative", height: 220 }}>
                  <RegionGlobe3D dotColor={LIME} wireColor="#C9C8C0" />
                </div>
                <div style={{ position: "absolute", right: 24, bottom: 24, display: "flex", gap: 5, alignItems: "center" }}>
                  <button
                    onClick={() => onNavigate("services")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "11px 20px",
                      borderRadius: 9999,
                      background: TEXT,
                      color: "#fff",
                      fontFamily: HEAD,
                      fontSize: 13,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    See More
                  </button>
                  <button
                    onClick={() => onNavigate("services")}
                    aria-label={t("aria.seeMoreServices")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 44,
                      height: 44,
                      borderRadius: 9999,
                      background: LIME,
                      color: TEXT,
                      fontSize: 15,
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {arrow}
                  </button>
                </div>
              </div>

              {}
              <div
                className="reveal"
                style={{
                  background: LIME,
                  borderRadius: 24,
                  padding: 32,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  minHeight: 440,
                  gap: 20,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 22, fontWeight: 700 }}>✕</span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      width: 54,
                      height: 30,
                      borderRadius: 9999,
                      background: TEXT,
                      padding: 3,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 24,
                        height: 24,
                        borderRadius: 9999,
                        background: LIME,
                        fontSize: 11,
                      }}
                    >
                      ⚡
                    </span>
                  </span>
                </div>
                <p style={{ margin: 0, fontFamily: HEAD, fontWeight: 500, fontSize: 25, lineHeight: 1.4 }}>
                  Infrastructure that <span style={{ color: "#4a5a1c" }}>spans nations</span> demands
                  protection that <span style={{ color: "#4a5a1c" }}>outlasts decades.</span>
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(["API Q1", "ISO 9001", "ISO 14001", "ISO 45001"] as const).map((c) => (
                    <span
                      key={c}
                      style={{
                        border: "1.5px solid rgba(18,18,18,0.25)",
                        borderRadius: 9999,
                        padding: "6px 12px",
                        fontSize: 11.5,
                        fontWeight: 600,
                      }}
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              {}
              <div
                className="reveal"
                style={{ background: INK, borderRadius: 24, position: "relative", overflow: "hidden", minHeight: 440 }}
              >
                <Image
                  src={facilityImg}
                  alt="United Services Egypt technician welding in the Cairo facility"
                  fill
                  sizes="(max-width: 900px) 100vw, 50vw"
                  style={{ objectFit: "cover" }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: "55%",
                    background: "linear-gradient(to top, rgba(10,10,12,0.85), rgba(10,10,12,0))",
                    pointerEvents: "none",
                  }}
                />
                <div style={{ position: "absolute", left: 28, right: 28, bottom: 24 }}>
                  <div style={{ color: "#fff", fontWeight: 600, fontSize: 19, lineHeight: 1.4 }}>
                    6,000 m² integrated facility in Cairo, serving 15+ major operators across 4 countries
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, color: "rgba(255,255,255,0.85)", fontSize: 13 }}>
                    <span style={{ color: LIME, fontSize: 15 }}>✳</span> EGPC Registered Vendor
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {}
        <section style={{ background: PAPER, padding: "110px 40px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div
              className="reveal"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 40, flexWrap: "wrap" }}
            >
              <div>
                <PublicTag>Our Mission</PublicTag>
                <h2
                  style={{
                    margin: "26px 0 0",
                    fontFamily: HEAD,
                    fontWeight: 700,
                    fontSize: "clamp(34px, 4vw, 52px)",
                    lineHeight: 1.08,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Corrosion Control,
                  <br />
                  <span style={{ color: MUTED }}>from Assessment to Execution</span>
                </h2>
              </div>
              <p style={{ margin: 0, maxWidth: 360, fontSize: 14.5, lineHeight: 1.7, color: "#5c5c58" }}>
                {t("methodology.subtitle")} Six corrosion-control systems — GRE lining, external
                wrapping, industrial coating, HDPE lining, RTP, and RTV insulator coating — applied
                in the factory and in the field to API, ISO, and NACE standards.
              </p>
            </div>

            <div
              className="responsive-card-grid"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, marginTop: 80, alignItems: "start" }}
            >
              <div className="reveal" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div style={{ background: LIME, borderRadius: 22, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600 }}>
                    <span>✚</span> 01 — {t("methodology.assess.title")}
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: "#2c2e18" }}>
                    {t("methodology.assess.desc")}
                  </p>
                </div>
                <div style={{ background: "#fff", borderRadius: 22, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ fontSize: 13.5, color: MUTED }}>{t("proof.countriesLabel")}</div>
                  <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 60, letterSpacing: "-0.02em", marginTop: "auto" }}>
                    {STATS[2].value}
                    <span style={{ color: MUTED, fontWeight: 500, fontSize: 20 }}> countries</span>
                  </div>
                </div>
                <div style={{ background: "#fff", borderRadius: 22, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600 }}>
                    <span>◎</span> 02 — {t("methodology.engineer.title")}
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: MUTED }}>
                    {t("methodology.engineer.desc")}
                  </p>
                  <div
                    style={{
                      marginTop: "auto",
                      display: "flex",
                      alignItems: "center",
                      height: 42,
                      borderRadius: 9999,
                      background: TEXT,
                      padding: 4,
                    }}
                  >
                    <span style={{ display: "block", width: "30%", height: "100%", borderRadius: 9999, background: LIME }} />
                    <span style={{ marginInlineStart: "auto", paddingInlineEnd: 16, color: "#fff", fontSize: 12 }}>
                      Full QA Documentation
                    </span>
                  </div>
                </div>
                <div style={{ background: LIME, borderRadius: 22, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600 }}>
                    <span>✪</span> 03 — {t("methodology.execute.title")}
                  </div>
                  <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: "#2c2e18" }}>
                    {t("methodology.execute.desc")}
                  </p>
                </div>
              </div>
              <div className="reveal" style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
                <div style={{ width: "100%", maxWidth: 480, aspectRatio: "4/5", borderRadius: 18, overflow: "hidden", background: "#fff", position: "relative" }}>
                  <Image
                    src={layerFigImg}
                    alt="Close-up cross-section of a pipe wall showing the coating layer against corroded steel beneath"
                    fill
                    sizes="(max-width: 900px) 100vw, 480px"
                    style={{ objectFit: "cover" }}
                  />
                </div>
                <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 11.5, color: MUTED }}>
                  FIG. 01 — MULTI-LAYER PIPELINE PROTECTION SYSTEM
                </div>
              </div>
            </div>
          </div>
        </section>

        {}
        <section style={{ background: PAPER, padding: "110px 40px" }}>
          <div
            className="responsive-card-grid"
            style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: 64, alignItems: "start" }}
          >
            <div className="reveal-left" style={{ display: "flex", flexDirection: "column", minHeight: 560 }}>
              <div>
                <PublicTag>Our Projects</PublicTag>
              </div>
              <h2
                style={{
                  margin: "30px 0 0",
                  fontFamily: HEAD,
                  fontWeight: 700,
                  fontSize: "clamp(34px, 4vw, 52px)",
                  lineHeight: 1.08,
                  letterSpacing: "-0.01em",
                }}
              >
                Built to perform,
                <br />
                <span style={{ color: MUTED }}>proven to last</span>
              </h2>
              <p style={{ margin: "28px 0 0", maxWidth: 520, fontSize: 14.5, lineHeight: 1.7, color: "#5c5c58" }}>
                From factory-applied linings to certified field installation, United Services
                Egypt delivers corrosion-control and pipeline-integrity projects across Egypt,
                Iraq, Saudi Arabia, and the UAE — engineered to API, ISO, and NACE standards.
              </p>
              <div style={{ marginTop: "auto", paddingTop: 64 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                  <span style={{ fontSize: 11 }}>⬢</span> Pipeline Integrity Portfolio
                </div>
                <button
                  onClick={() => onNavigate("projects")}
                  aria-label="View our projects"
                  style={{
                    position: "relative",
                    width: 168,
                    height: 130,
                    marginTop: 20,
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    transition: "transform 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.transform = "translateY(-4px)"
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.transform = "none"
                  }}
                >
                  <Image
                    src={projThumb2}
                    alt=""
                    width={128}
                    height={118}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 40,
                      borderRadius: 14,
                      objectFit: "cover",
                      transform: "rotate(6deg)",
                      boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
                      border: `3px solid ${PAPER}`,
                    }}
                  />
                  <Image
                    src={projThumb1}
                    alt="Pipeline integrity project photos — view all projects"
                    width={128}
                    height={118}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      borderRadius: 14,
                      objectFit: "cover",
                      transform: "rotate(-4deg)",
                      boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
                      border: `3px solid ${PAPER}`,
                    }}
                  />
                </button>
              </div>
            </div>

            <div className="reveal-right" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {services[0] && (
                <div
                  style={{
                    background: "#fff",
                    border: "1.5px solid #E6E5E0",
                    borderRadius: 22,
                    padding: "30px 32px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 20,
                  }}
                >
                  <div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 23 }}>{services[0].name}</div>
                  <button
                    onClick={() => onNavigate("services")}
                    style={{ flexShrink: 0, padding: "12px 24px", borderRadius: 9999, background: "#fff", border: "1.5px solid #E6E5E0", fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: BODY }}
                  >
                    View Service
                  </button>
                </div>
              )}

              {services[1] && (
                <div style={{ background: INK, borderRadius: 22, padding: 36, display: "flex", flexDirection: "column", gap: 40 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
                    <div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 32, lineHeight: 1.15, color: "#fff", maxWidth: 320 }}>
                      {services[1].name}
                    </div>
                    <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0 }}>
                      <button
                        onClick={() => onNavigate("services")}
                        style={{ display: "inline-flex", alignItems: "center", padding: "12px 22px", borderRadius: 9999, background: LIME, color: TEXT, fontSize: 13.5, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: BODY }}
                      >
                        See Service
                      </button>
                      <button
                        onClick={() => onNavigate("services")}
                        aria-hidden="true"
                        tabIndex={-1}
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 9999, background: LIME, color: TEXT, fontSize: 15, border: "none", cursor: "pointer" }}
                      >
                        {arrow}
                      </button>
                    </div>
                  </div>
                  <p style={{ margin: 0, color: "#A9A9A9", fontSize: 14, lineHeight: 1.7, maxWidth: 480 }}>
                    {services[1].longDescription ?? services[1].shortDescription}
                  </p>
                </div>
              )}

              {services[2] && (
                <div
                  style={{
                    background: "#fff",
                    border: "1.5px solid #E6E5E0",
                    borderRadius: 22,
                    padding: "30px 32px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 20,
                  }}
                >
                  <div style={{ fontFamily: HEAD, fontWeight: 600, fontSize: 23 }}>{services[2].name}</div>
                  <button
                    onClick={() => onNavigate("services")}
                    style={{ flexShrink: 0, padding: "12px 24px", borderRadius: 9999, background: "#fff", border: "1.5px solid #E6E5E0", fontSize: 13.5, fontWeight: 500, cursor: "pointer", fontFamily: BODY }}
                  >
                    View Service
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {}
        <section
          style={{
            position: "relative",
            background: INK,
            minHeight: "92vh",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            overflow: "hidden",
            padding: "56px 48px",
          }}
        >
          {services.map((s, i) => (
            <div
              key={s.id}
              style={{
                position: "absolute",
                inset: 0,
                opacity: i === svcIndex % Math.max(svcCount, 1) ? 1 : 0,
                transition: "opacity 0.6s ease",
                pointerEvents: "none",
              }}
            >
              <img
                src={s.imageUrl || SVC_PHOTOS[i % SVC_PHOTOS.length]}
                alt=""
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          ))}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to top, rgba(8,8,10,0.88) 0%, rgba(8,8,10,0.35) 45%, rgba(8,8,10,0.25) 100%)",
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative" }}>
            <PublicTag>Our Services</PublicTag>
          </div>
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 48, alignItems: "center", padding: "64px 0" }}>
            <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "clamp(36px, 4.5vw, 58px)", color: "#fff" }}>
              (<span>{String(svcIndex + 1).padStart(2, "0")}</span>
              <span style={{ color: "rgba(255,255,255,0.45)" }}>/{String(svcCount).padStart(2, "0")}</span>)
            </div>
            <div style={{ maxWidth: 660 }}>
              {activeSvc && (
                <>
                  <div style={{ fontFamily: "ui-monospace,monospace", fontSize: 12.5, letterSpacing: "0.06em", color: LIME, marginBottom: 14, textTransform: "uppercase" }}>
                    {activeSvc.shortDescription}
                  </div>
                  <h2 style={{ margin: 0, fontFamily: HEAD, fontWeight: 600, fontSize: "clamp(32px, 4vw, 54px)", lineHeight: 1.08, letterSpacing: "-0.01em", color: "#fff" }}>
                    {activeSvc.name}
                  </h2>
                  <p style={{ margin: "22px 0 0", fontSize: 14.5, lineHeight: 1.75, color: "rgba(255,255,255,0.85)", maxWidth: 640 }}>
                    {activeSvc.longDescription ?? activeSvc.shortDescription}
                  </p>
                </>
              )}
              {!activeSvc && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div className="us-skeleton" style={{ height: 12, width: 160, borderRadius: 4, opacity: 0.25 }} />
                  <div className="us-skeleton" style={{ height: 40, width: "70%", borderRadius: 6, opacity: 0.25 }} />
                  <div className="us-skeleton" style={{ height: 12, width: "90%", borderRadius: 4, opacity: 0.2, marginTop: 8 }} />
                  <div className="us-skeleton" style={{ height: 12, width: "60%", borderRadius: 4, opacity: 0.2 }} />
                </div>
              )}
            </div>
          </div>
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 28 }}>
            <div style={{ flex: 1, height: 2, background: "rgba(255,255,255,0.25)", borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  background: "#fff",
                  transformOrigin: "left",
                  transform: `scaleX(${svcCount > 0 ? ((svcIndex % svcCount) + 1) / svcCount : 0})`,
                  transition: "transform 0.5s ease",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => step(-1)}
                aria-label={t("aria.previousService")}
                style={{ width: 44, height: 44, borderRadius: 9999, border: "1px solid rgba(255,255,255,0.3)", background: "rgba(14,14,16,0.6)", color: "#fff", fontSize: 16, cursor: "pointer" }}
              >
                ←
              </button>
              <button
                onClick={() => step(1)}
                aria-label={t("aria.nextService")}
                style={{ width: 44, height: 44, borderRadius: 9999, border: "none", background: LIME, color: TEXT, fontSize: 16, cursor: "pointer" }}
              >
                →
              </button>
            </div>
          </div>
        </section>

        {}
        <section style={{ background: PAPER, padding: "110px 0 90px" }}>
          <div className="reveal" style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 40px" }}>
            <PublicTag>Our Certifications</PublicTag>
            <h2
              style={{
                margin: "34px 0 0",
                maxWidth: 1040,
                textAlign: "center",
                fontFamily: HEAD,
                fontWeight: 600,
                fontSize: "clamp(26px, 3.2vw, 42px)",
                lineHeight: 1.3,
                letterSpacing: "-0.01em",
              }}
            >
              {t("clients.title")}. <span style={{ color: MUTED }}>Certified, audited, and registered to the standards the industry demands.</span>
            </h2>
          </div>
          <div
            ref={clientsRef}
            onScroll={onClientsScroll}
            data-hidescroll="1"
            style={{ display: "flex", gap: 28, alignItems: "flex-start", overflowX: "auto", padding: "70px 40px 10px", scrollSnapType: "x mandatory" }}
          >
            {CERT_KEYS.map((key, i) => (
              <div
                key={key}
                style={{
                  flex: "none",
                  width: 320,
                  background: "#fff",
                  borderRadius: 20,
                  padding: 30,
                  display: "flex",
                  flexDirection: "column",
                  gap: 30,
                  marginTop: i % 2 === 0 ? 0 : 40,
                  scrollSnapAlign: "start",
                }}
              >
                <span style={{ fontFamily: HEAD, fontWeight: 700, fontSize: 24 }}>{CERT_CODES[key]}</span>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "#3c3c38" }}>{t(`certs.${key}`)}</p>
              </div>
            ))}
          </div>
          <div style={{ margin: "56px 40px 0", height: 2, background: "#DDDCD6", borderRadius: 2, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: "100%",
                background: TEXT,
                transformOrigin: "left",
                transform: `scaleX(${clientsProgress})`,
                transition: "transform 0.2s linear",
              }}
            />
          </div>
        </section>

        {}
        <section style={{ background: INK, padding: "100px 48px 44px", position: "relative", overflow: "hidden" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div className="reveal" style={{ display: "flex", justifyContent: "space-between", gap: 60, flexWrap: "wrap" }}>
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontFamily: HEAD,
                    fontWeight: 600,
                    fontSize: "clamp(30px, 3.4vw, 46px)",
                    lineHeight: 1.15,
                    letterSpacing: "-0.01em",
                    color: "#fff",
                  }}
                >
                  {t("cta.title")}
                </h2>
                <p style={{ margin: "22px 0 0", maxWidth: 380, color: "#A9A9A9", fontSize: 14, lineHeight: 1.7 }}>
                  {t("cta.body")}
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(200px,260px))", gap: "56px 64px" }}>
                <div>
                  <div style={{ color: LIME, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Headquarters</div>
                  <div style={{ color: "#fff", fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
                    14S Building, El Oroba Street Extension,
                    <br />
                    New Maadi, Cairo
                  </div>
                </div>
                <div>
                  <div style={{ color: LIME, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Contact Us</div>
                  <div style={{ marginTop: 12 }}>
                    <a href="tel:+20227033656" style={{ color: "#fff", fontSize: 14 }}>
                      (+2) 0227033656
                    </a>
                  </div>
                </div>
                <div>
                  <div style={{ color: LIME, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Email</div>
                  <div style={{ marginTop: 12 }}>
                    <a href="mailto:info@use-eg.com" style={{ color: "#fff", fontSize: 14 }}>
                      info@use-eg.com
                    </a>
                  </div>
                </div>
                <div>
                  <div style={{ color: LIME, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Regions</div>
                  <div style={{ color: "#fff", fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
                    Egypt · Iraq · Saudi Arabia · UAE
                  </div>
                </div>
              </div>
            </div>

            <div
              className="reveal"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 60, marginTop: 130, flexWrap: "wrap" }}
            >
              <div>
                <div style={{ color: "#A9A9A9", fontSize: 15, margin: "0 0 6px 8px" }}>
                  ©{new Date().getFullYear()}
                </div>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 24 }}>
                  <div style={{ fontFamily: HEAD, fontWeight: 700, fontSize: "clamp(44px, 7.5vw, 120px)", lineHeight: 0.95, letterSpacing: "-0.02em", color: "#fff" }}>
                    United Services
                  </div>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <button
                      onClick={() => onNavigate("services")}
                      style={{ display: "inline-flex", alignItems: "center", padding: "13px 24px", borderRadius: 9999, background: TEXT, border: "1px solid rgba(255,255,255,0.18)", color: "#fff", fontFamily: HEAD, fontSize: 13.5, cursor: "pointer" }}
                    >
                      {t("hero.ctaServices")}
                    </button>
                    <button
                      onClick={() => onNavigate("services")}
                      aria-hidden="true"
                      tabIndex={-1}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: 9999, background: LIME, color: TEXT, fontSize: 15, border: "none", cursor: "pointer" }}
                    >
                      {arrow}
                    </button>
                  </div>
                </div>
              </div>
              <div style={{ maxWidth: 300, display: "flex", flexDirection: "column", gap: 20 }}>
                <p style={{ margin: 0, color: "#A9A9A9", fontSize: 13.5, lineHeight: 1.7 }}>
                  Corrosion control and pipeline integrity solutions for the oil &amp; gas
                  industry across Egypt, Iraq, Saudi Arabia, and the UAE.
                </p>
                <p style={{ margin: 0, color: "#6f6f6b", fontSize: 12.5 }}>
                  © {new Date().getFullYear()} United Services Egypt. All rights reserved. · EGPC Registered
                </p>
              </div>
            </div>

            <div
              className="reveal"
              style={{
                borderTop: "1px solid rgba(255,255,255,0.1)",
                marginTop: 56,
                paddingTop: 28,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 16,
              }}
            >
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {(["about", "vision", "services", "projects", "careers", "contact"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => onNavigate(p)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#A9A9A9", fontSize: 13, fontFamily: BODY }}
                  >
                    {tNav(p)}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 24 }}>
                <button
                  onClick={() => onNavigate("privacy")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6f6f6b", fontSize: 13, fontFamily: BODY }}
                >
                  {tFooter("privacyPolicy")}
                </button>
                <button
                  onClick={() => onNavigate("terms")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#6f6f6b", fontSize: 13, fontFamily: BODY }}
                >
                  {tFooter("termsOfService")}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
