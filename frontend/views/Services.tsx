"use client" /* Page header */ /* Cross-section diagram */ /* Services list */ /* Collapsed header */ /* Expanded content */
import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import PublicNav from "../components/PublicNav"
import PublicFooter from "../components/PublicFooter"
import { useReveal } from "../hooks/useReveal"
import { axios } from "../lib/api"
import { LAYER_KEYS, LAYER_STYLE } from "../lib/pipelineLayers"
import { INK, PAPER, TEXT, MUTED, LIME, HEAD, BODY } from "../lib/publicTheme"

interface Props {
  onNavigate: (page: string) => void
}

interface Service {
  id: string
  slug: string
  name: string
  shortDescription: string
  longDescription: string
  specs: string[]
  imageUrl: string | null
}

export default function Services({ onNavigate }: Props) {
  useReveal()
  const t = useTranslations("servicesPage")
  const tNav = useTranslations("nav")
  const locale = useLocale()
  const [active, setActive] = useState<number | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Re-fetch on locale change too, same reasoning as Careers.tsx's
    // identical effect — a switched-language visitor should see
    // translated content without needing a full page reload.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    axios
      .get("/services", {
        params: locale !== "en" ? { locale } : undefined,
      })
      .then(({ data }) => setServices(data))
      .finally(() => setLoading(false))
  }, [locale])

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
                    paddingLeft: 12,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      color: "#fff",
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
          {loading && (
            <div
              style={{ padding: 40, textAlign: "center", color: MUTED }}
            >
              {t("loading")}
            </div>
          )}
          {services.map((svc, i) => (
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
