"use client"

import { useRef, useState } from "react"
import {
  motion,
  useMotionValueEvent,
  useScroll,
  useTransform,
} from "framer-motion"
import { useTranslations } from "next-intl"
import { palette } from "../../theme"
import { LAYER_KEYS, LAYER_STYLE, SERVICE_SLUG_TO_LAYER } from "../../lib/pipelineLayers"
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion"

interface ServicePreview {
  id: string
  slug: string
  name: string
  shortDescription: string
}

interface Props {
  services: ServicePreview[]
  onNavigate: (page: string) => void
}

// Bounded, fixed-length descent — not infinite scroll. Five layers at
// 90vh of scroll distance each reads as deliberate without dragging.
const VH_PER_LAYER = 90
const MAX_DEPTH_M = 1200

export default function LayerDive({ services, onNavigate }: Props) {
  const t = useTranslations("home.layerDive")
  const tSvcPage = useTranslations("servicesPage")
  const reducedMotion = usePrefersReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  })
  const [activeIndex, setActiveIndex] = useState(0)
  const [depth, setDepth] = useState(0)

  const indexMV = useTransform(
    scrollYProgress,
    LAYER_KEYS.map((_, i) => i / LAYER_KEYS.length),
    LAYER_KEYS.map((_, i) => i),
  )
  const depthMV = useTransform(scrollYProgress, [0, 1], [0, MAX_DEPTH_M])
  const markerTop = useTransform(scrollYProgress, [0, 1], ["0%", "100%"])

  useMotionValueEvent(indexMV, "change", (v) => {
    setActiveIndex(Math.min(LAYER_KEYS.length - 1, Math.max(0, Math.round(v))))
  })
  useMotionValueEvent(depthMV, "change", (v) => setDepth(Math.round(v)))

  const activeKey = LAYER_KEYS[activeIndex]
  const matchedSlug = Object.entries(SERVICE_SLUG_TO_LAYER).find(
    ([, layer]) => layer === activeKey,
  )?.[0]
  const matchedService = services.find((s) => s.slug === matchedSlug)

  if (reducedMotion) {
    // Same information, no scroll-scrubbing: a plain stacked list, each
    // layer statically visible with its color and (where one exists) its
    // matching service.
    return (
      <section style={{ background: palette.navy, padding: "80px 28px" }}>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <h2
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              fontWeight: 800,
              color: "#fff",
              marginBottom: 40,
              textAlign: "center",
            }}
          >
            {t("title")}
          </h2>
          {LAYER_KEYS.map((key) => {
            const slug = Object.entries(SERVICE_SLUG_TO_LAYER).find(
              ([, layer]) => layer === key,
            )?.[0]
            const svc = services.find((s) => s.slug === slug)
            return (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "18px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: LAYER_STYLE[key].color,
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>
                    {tSvcPage(`diagram.layers.${key}.label` as any)}
                  </div>
                  {svc && (
                    <button
                      onClick={() => onNavigate("services")}
                      style={{
                        background: "none",
                        border: "none",
                        color: palette.accent,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: 0,
                        marginTop: 4,
                      }}
                    >
                      {svc.name} →
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <section
      ref={containerRef}
      style={{ position: "relative", height: `${VH_PER_LAYER * LAYER_KEYS.length}vh` }}
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "hidden",
          background: palette.navy,
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          style={{
            maxWidth: 1260,
            margin: "0 auto",
            padding: "0 28px",
            width: "100%",
            display: "grid",
            gridTemplateColumns: "120px 1fr",
            gap: 56,
            alignItems: "center",
          }}
        >
          {}
          <div
            style={{
              position: "relative",
              height: 360,
              width: 10,
              borderRadius: 9999,
              background: "rgba(255,255,255,0.08)",
              justifySelf: "center",
              overflow: "hidden",
            }}
          >
            {LAYER_KEYS.map((key, i) => (
              <div
                key={key}
                style={{
                  position: "absolute",
                  top: `${(i / LAYER_KEYS.length) * 100}%`,
                  height: `${100 / LAYER_KEYS.length}%`,
                  width: "100%",
                  background: LAYER_STYLE[key].color,
                  opacity: activeIndex === i ? 1 : 0.3,
                  transition: "opacity 0.3s",
                }}
              />
            ))}
            <motion.div
              style={{
                position: "absolute",
                top: markerTop,
                left: -6,
                width: 22,
                height: 3,
                borderRadius: 2,
                background: "#fff",
                boxShadow: "0 0 8px rgba(255,255,255,0.8)",
              }}
            />
          </div>

          {}
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "0.2em",
                color: "#64748B",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              {t("eyebrow")}
            </div>
            <div
              style={{
                fontVariantNumeric: "tabular-nums",
                fontSize: 13,
                color: palette.accent,
                fontWeight: 700,
                marginBottom: 16,
              }}
            >
              {depth.toLocaleString()}m
            </div>
            <h3
              key={activeKey}
              className="layer-dive-fade"
              style={{
                fontSize: "clamp(28px, 4vw, 48px)",
                fontWeight: 800,
                color: "#fff",
                letterSpacing: "-0.02em",
                marginBottom: 16,
              }}
            >
              {tSvcPage(`diagram.layers.${activeKey}.label` as any)}
            </h3>
            {matchedService ? (
              <button
                key={matchedService.id}
                onClick={() => onNavigate("services")}
                className="layer-dive-fade"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 9999,
                  padding: "10px 20px",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "Poppins, sans-serif",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: LAYER_STYLE[activeKey].color,
                  }}
                />
                {matchedService.name}
                <span style={{ color: palette.accent }}>→</span>
              </button>
            ) : (
              <p style={{ color: "#94A3B8", fontSize: 14, maxWidth: 380 }}>
                {t(`structural.${activeKey}` as any)}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
