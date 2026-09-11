"use client" /* Page header */ /* Cross-section diagram */ /* Services list */ /* Collapsed header */ /* Expanded content */
import { useCallback, useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import PublicNav from "../components/PublicNav"
import PublicFooter from "../components/PublicFooter"
import ErrorBanner from "../components/ErrorBanner"
import { useReveal } from "../hooks/useReveal"
import { axios } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { LAYER_KEYS, LAYER_STYLE } from "../lib/pipelineLayers"
import { INK, PAPER, TEXT, MUTED, LIME, HEAD, BODY, PublicTag } from "../lib/publicTheme"
import dynamic from "next/dynamic"
// See views/About.tsx for why this is dynamic — same heavy, WebGL-only,
// purely decorative dependency.
const PipeCrossSection3D = dynamic(() => import("../components/three/PipeCrossSection3D"), { ssr: false })
import { Skeleton } from "../components/Skeleton"

interface Props {
  onNavigate: (page: string) => void
  // Server-fetched (see app/[locale]/services/page.tsx) — see
  // Careers.tsx's identical initialPositions prop for the full reasoning.
  initialServices?: Service[]
}

export interface Service {
  id: string
  slug: string
  name: string
  shortDescription: string
  longDescription: string
  specs: string[]
  imageUrl: string | null
}

export default function Services({ onNavigate, initialServices }: Props) {
  useReveal()
  const t = useTranslations("servicesPage")
  const tNav = useTranslations("nav")
  const locale = useLocale()
  const [active, setActive] = useState<number | null>(null)
  const [services, setServices] = useState<Service[]>(initialServices ?? [])
  // GRE gets a dedicated, non-collapsible featured section above the
  // accordion (client direction: GRE is the flagship service, everything
  // else is secondary) — the same "Additional Services" split already
  // shipped on the homepage (views/Home.tsx).
  const greService = services.find((s) => s.slug === "gre-tubular-lining")
  const otherServices = services.filter((s) => s.slug !== "gre-tubular-lining")
  const [loading, setLoading] = useState(initialServices === undefined)
  const skipNextFetch = useRef(initialServices !== undefined)
  const tCommon = useTranslations("common")
  const [loadError, setLoadError] = useState<string | null>(null)
  // See Careers.tsx for why these are resolved to strings up front.
  const loadFailedMsg = tCommon("errors.loadFailed")
  const load = useCallback(() => {
    setLoading(true)
    setLoadError(null)
    axios
      .get("/services", {
        params: locale !== "en" ? { locale } : undefined,
      })
      .then(({ data }) => setServices(data))
      // A failed fetch used to leave the whole service catalogue
      // silently blank — same unhandled-rejection shape as Careers.
      .catch((err) => setLoadError(getErrorMessage(err, loadFailedMsg)))
      .finally(() => setLoading(false))
  }, [locale, loadFailedMsg])

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false
      return
    }
    // Re-fetch on locale change too, same reasoning as Careers.tsx's
    // identical effect — a switched-language visitor should see
    // translated content without needing a full page reload.
    load()
  }, [load])

  return (
    <div style={{ fontFamily: BODY, background: PAPER, color: TEXT }}>
      <PublicNav current="services" onNavigate={onNavigate} />

      {}
      <section
        style={{
          paddingTop: 68,
          background: INK,
          padding: "120px 28px 80px",
        }}
      >
        <div style={{ maxWidth: 1260, margin: "0 auto" }}>
          <h1
            style={{
              fontFamily: HEAD,
              fontSize: "clamp(36px, 5vw, 64px)",
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.02em",
              marginBottom: 20,
              maxWidth: 700,
            }}
          >
            {t("title")}
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "#A9A9A9",
              maxWidth: 540,
              lineHeight: 1.7,
            }}
          >
            {t("subtitle")}
          </p>
        </div>
      </section>

      {}
      <section
        style={{
          background: "#fff",
          padding: "72px 28px",
          borderBottom: "1px solid #E6E5E0",
        }}
      >
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
            <h2
              style={{
                fontFamily: HEAD,
                fontSize: 32,
                fontWeight: 600,
                color: TEXT,
                marginBottom: 12,
                letterSpacing: "-0.01em",
              }}
            >
              {t("diagram.title")}
            </h2>
            <p
              style={{
                fontSize: 14,
                color: MUTED,
                lineHeight: 1.7,
                marginBottom: 32,
              }}
            >
              {t("diagram.body")}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {LAYER_KEYS.map((key, i) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    animation: `layerSlide 0.4s ease ${i * 0.1}s both`,
                  }}
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: LAYER_STYLE[key].color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      color: TEXT,
                      fontWeight: 500,
                    }}
                  >
                    {t(`diagram.layers.${key}.label` as any)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div
            className="reveal-right"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              justifyContent: "center",
            }}
          >
            <div style={{ position: "relative", height: 220, marginBottom: 12 }}>
              <PipeCrossSection3D />
            </div>
            {LAYER_KEYS.map((key) => (
              <div
                key={key}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <div
                  style={{
                    height: 36,
                    background: LAYER_STYLE[key].color,
                    borderRadius: 6,
                    width: LAYER_STYLE[key].width,
                    display: "flex",
                    alignItems: "center",
                    paddingInlineStart: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: LAYER_STYLE[key].label,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t(`diagram.layers.${key}.short` as any)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GRE Liner — flagship service, non-collapsible, above the
          "Additional Services" accordion. Deliberately light on copy:
          name + one line + spec chips, no long paragraph, matching the
          homepage spotlight's minimal-text treatment. */}
      {greService && (
        <section style={{ background: INK, padding: "80px 28px" }}>
          <div
            className="responsive-card-grid reveal"
            style={{
              maxWidth: 1260,
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "1.1fr 1fr",
              gap: 48,
              alignItems: "center",
            }}
          >
            <div>
              <PublicTag>{t("flagship")}</PublicTag>
              <h2
                style={{
                  margin: "22px 0 0",
                  fontFamily: HEAD,
                  fontWeight: 700,
                  fontSize: "clamp(28px, 3.4vw, 44px)",
                  lineHeight: 1.08,
                  letterSpacing: "-0.01em",
                  color: "#fff",
                }}
              >
                {greService.name}
              </h2>
              <p
                style={{
                  margin: "14px 0 0",
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: "rgba(255,255,255,0.8)",
                  maxWidth: 480,
                }}
              >
                {greService.shortDescription}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 24 }}>
                {greService.specs.map((sp) => (
                  <span
                    key={sp}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#fff",
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 6,
                      padding: "5px 11px",
                    }}
                  >
                    {sp}
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 32 }}>
                <button
                  onClick={() => onNavigate("client-login")}
                  style={{
                    background: LIME,
                    color: TEXT,
                    border: "none",
                    borderRadius: 9999,
                    padding: "12px 28px",
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: BODY,
                  }}
                >
                  {t("requestSpecFile")}
                </button>
                <button
                  onClick={() => onNavigate("contact")}
                  style={{
                    background: "transparent",
                    color: "#fff",
                    border: "1.5px solid rgba(255,255,255,0.35)",
                    borderRadius: 9999,
                    padding: "12px 28px",
                    fontWeight: 500,
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: HEAD,
                  }}
                >
                  {tNav("requestConsultation")}
                </button>
              </div>
            </div>
            {greService.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded S3 presigned URL
              <img
                src={greService.imageUrl}
                alt={greService.name}
                loading="lazy"
                style={{
                  width: "100%",
                  aspectRatio: "4/3",
                  objectFit: "cover",
                  borderRadius: 20,
                }}
              />
            )}
          </div>
        </section>
      )}

      {}
      <section style={{ padding: "80px 28px" }}>
        <div
          style={{
            maxWidth: 1260,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div style={{ marginBottom: 26 }}>
            <PublicTag>{t("additional")}</PublicTag>
          </div>
          <ErrorBanner
            message={loadError}
            onDismiss={() => setLoadError(null)}
            dismissLabel={tCommon("errors.dismiss")}
            onRetry={load}
            retryLabel={tCommon("errors.retry")}
          />
          {loading &&
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid #E6E5E0",
                  borderRadius: 20,
                  padding: 28,
                  marginBottom: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                }}
              >
                <Skeleton height={48} width={48} radius={12} />
                <div style={{ flex: 1 }}>
                  <Skeleton height={16} width="30%" style={{ marginBottom: 10 }} />
                  <Skeleton height={12} width="55%" />
                </div>
              </div>
            ))}
          {otherServices.map((svc, i) => (
            <div
              key={svc.id}
              className="reveal"
              style={{
                border: "1px solid #E6E5E0",
                borderRadius: 20,
                overflow: "hidden",
                transitionDelay: `${i * 0.06}s`,
              }}
            >
              {}
              <button
                onClick={() => setActive(active === i ? null : i)}
                style={{
                  width: "100%",
                  background: active === i ? "rgba(216,255,62,0.18)" : "#fff",
                  border: "none",
                  cursor: "pointer",
                  padding: "28px 32px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 24,
                  fontFamily: BODY,
                  transition: "background 0.2s",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: 20 }}
                >
                  <div
                    style={{
                      fontFamily: "ui-monospace,monospace",
                      fontSize: 11,
                      color: active === i ? TEXT : MUTED,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      flexShrink: 0,
                    }}
                  >
                    SVC-0{i + 1}
                  </div>
                  <div style={{ textAlign: "start" }}>
                    <div
                      style={{
                        fontFamily: HEAD,
                        fontSize: 18,
                        fontWeight: 600,
                        color: TEXT,
                      }}
                    >
                      {svc.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: MUTED,
                        marginTop: 2,
                      }}
                    >
                      {svc.shortDescription}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: active === i ? LIME : PAPER,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    transition: "background 0.2s",
                  }}
                >
                  <span
                    style={{
                      fontSize: 18,
                      color: TEXT,
                      lineHeight: 1,
                      transform: active === i ? "rotate(45deg)" : "none",
                      display: "inline-block",
                      transition: "transform 0.2s",
                    }}
                  >
                    +
                  </span>
                </div>
              </button>

              {}
              {active === i && (
                <div
                  style={{
                    background: PAPER,
                    borderTop: "1px solid #E6E5E0",
                    padding: "36px 32px",
                  }}
                >
                  <div
                    className="responsive-card-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 48,
                      alignItems: "start",
                    }}
                  >
                    <div>
                      {svc.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded S3 presigned URL, not a static build-time asset next/image can optimize
                        <img
                          src={svc.imageUrl}
                          alt={svc.name}
                          loading="lazy"
                          style={{
                            width: "100%",
                            aspectRatio: "16/9",
                            objectFit: "cover",
                            borderRadius: 14,
                            marginBottom: 24,
                          }}
                        />
                      )}
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
                      >
                        {svc.specs.map((sp) => (
                          <span
                            key={sp}
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: TEXT,
                              background: "#fff",
                              borderRadius: 6,
                              padding: "4px 10px",
                              border: "1px solid #E6E5E0",
                            }}
                          >
                            {sp}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: 15,
                          color: MUTED,
                          lineHeight: 1.8,
                          marginBottom: 32,
                        }}
                      >
                        {svc.longDescription}
                      </p>
                      <div
                        style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
                      >
                        <button
                          onClick={() => onNavigate("client-login")}
                          style={{
                            background: LIME,
                            color: TEXT,
                            border: "none",
                            borderRadius: 9999,
                            padding: "11px 28px",
                            fontWeight: 600,
                            fontSize: 14,
                            cursor: "pointer",
                            fontFamily: BODY,
                          }}
                        >
                          {t("requestSpecFile")}
                        </button>
                        <button
                          onClick={() => onNavigate("contact")}
                          style={{
                            background: TEXT,
                            color: "#fff",
                            border: "none",
                            borderRadius: 9999,
                            padding: "11px 28px",
                            fontWeight: 500,
                            fontSize: 14,
                            cursor: "pointer",
                            fontFamily: HEAD,
                          }}
                        >
                          {tNav("requestConsultation")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
