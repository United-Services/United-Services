"use client" /* Page header */ /* Cross-section diagram */ /* Services list */ /* Collapsed header */ /* Expanded content */
import { useState } from "react"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import PublicNav from "../components/PublicNav"
import PublicFooter from "../components/PublicFooter"
import { useReveal } from "../hooks/useReveal"

const greApplicationImg = "/images/bp-valves.jpg"
const insulatorImg = "/images/lux-power.jpg"

const SVC_IMGS: Record<string, string> = {
  gre: greApplicationImg,
  wrap: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=900&q=80",
  coating:
    "https://images.unsplash.com/photo-1678984239420-43cdc183bce6?w=900&q=80",
  hdpe: "https://images.unsplash.com/photo-1684667273934-e5d39307eeae?w=900&q=80",
  rtp: "https://images.unsplash.com/photo-1758965364875-e090e5423d2d?w=900&q=80",
  rtv: insulatorImg,
}

interface Props {
  onNavigate: (page: string) => void
}

const SERVICE_KEYS = ["gre", "wrap", "coating", "hdpe", "rtp", "rtv"] as const
const LAYER_KEYS = ["wrap", "coating", "steel", "lining", "flow"] as const
const LAYER_STYLE: Record<typeof LAYER_KEYS[number], {
  color: string
  width: string
}> = {
  wrap: { color: "#EA580C", width: "100%" },
  coating: { color: "#FB923C", width: "88%" },
  steel: { color: "#475569", width: "76%" },
  lining: { color: "#0EA5E9", width: "62%" },
  flow: { color: "#BAE6FD", width: "46%" },
}

export default function Services({ onNavigate }: Props) {
  useReveal()
  const t = useTranslations("servicesPage")
  const tSvc = useTranslations("services.names")
  const tNav = useTranslations("nav")
  const [active, setActive] = useState<number | null>(null)

  return (
    <div style={{ fontFamily: "Poppins, sans-serif", background: "#fff" }}>
      <PublicNav current="services" onNavigate={onNavigate} />

      {}
      <section
        style={{
          paddingTop: 68,
          background: palette.navy,
          padding: "120px 28px 80px",
        }}
      >
        <div style={{ maxWidth: 1260, margin: "0 auto" }}>
          <h1
            style={{
              fontSize: "clamp(36px, 5vw, 64px)",
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.03em",
              marginBottom: 20,
              maxWidth: 700,
            }}
          >
            {t("title")}
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "#94A3B8",
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
          background: "#F8FAFC",
          padding: "72px 28px",
          borderBottom: "1px solid #E2E8F0",
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
                fontSize: 32,
                fontWeight: 800,
                color: palette.navy,
                marginBottom: 12,
                letterSpacing: "-0.02em",
              }}
            >
              {t("diagram.title")}
            </h2>
            <p
              style={{
                fontSize: 14,
                color: palette.muted,
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
                      color: palette.slate,
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
                    transition: "width 1s ease",
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
          {SERVICE_KEYS.map((key, i) => {
            const specs = t.raw(`specs.${key}`) as string[]
            return (
              <div
                key={key}
                className="reveal"
                style={{
                  border: "1px solid #E2E8F0",
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
                    background: active === i ? "#FFF7ED" : "#fff",
                    border: "none",
                    cursor: "pointer",
                    padding: "28px 32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 24,
                    fontFamily: "Poppins, sans-serif",
                    transition: "background 0.2s",
                  }}
                >
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 20 }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: active === i ? palette.accent : "#94A3B8",
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        flexShrink: 0,
                      }}
                    >
                      SVC-0{i + 1}
                    </div>
                    <div style={{ textAlign: "start" }}>
                      <div
                        style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: palette.navy,
                        }}
                      >
                        {tSvc(key)}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: palette.muted,
                          marginTop: 2,
                        }}
                      >
                        {t(`tags.${key}` as any)}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      background: active === i ? palette.accent : "#F1F5F9",
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
                        color: active === i ? "#fff" : "#64748B",
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
                      background: "#FFFAF7",
                      borderTop: "1px solid #FDE8D0",
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
                        <img
                          src={SVC_IMGS[key]}
                          alt={t(`imgAlt.${key}` as any)}
                          style={{
                            width: "100%",
                            aspectRatio: "16/9",
                            objectFit: "cover",
                            borderRadius: 14,
                            marginBottom: 24,
                          }}
                        />
                        <div
                          style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
                        >
                          {specs.map((sp) => (
                            <span
                              key={sp}
                              style={{
                                fontSize: 12,
                                fontWeight: 600,
                                color: palette.accent,
                                background: palette.accentLight,
                                borderRadius: 6,
                                padding: "4px 10px",
                                border: "1px solid #FED7AA",
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
                            color: palette.slate,
                            lineHeight: 1.8,
                            marginBottom: 32,
                          }}
                        >
                          {t(`desc.${key}` as any)}
                        </p>
                        <div
                          style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
                        >
                          <button
                            onClick={() => onNavigate("client-login")}
                            style={{
                              background: palette.accent,
                              color: "#fff",
                              border: "none",
                              borderRadius: 9999,
                              padding: "11px 28px",
                              fontWeight: 700,
                              fontSize: 14,
                              cursor: "pointer",
                              fontFamily: "Poppins, sans-serif",
                            }}
                          >
                            {t("requestSpecFile")}
                          </button>
                          <button
                            onClick={() => onNavigate("contact")}
                            style={{
                              background: "#4B5563",
                              color: "#fff",
                              border: "none",
                              borderRadius: 9999,
                              padding: "11px 28px",
                              fontWeight: 600,
                              fontSize: 14,
                              cursor: "pointer",
                              fontFamily: "Poppins, sans-serif",
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
            )
          })}
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
