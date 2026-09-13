"use client" /* Page header */ /* Cross-section diagram */ /* Services list */ /* Collapsed header */ /* Expanded content */
import { useCallback, useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import PublicNav from "../components/PublicNav"
import PublicFooter from "../components/PublicFooter"
import ErrorBanner from "../components/ErrorBanner"
import { useReveal } from "../hooks/useReveal"
import { axios } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { INK, PAPER, TEXT, MUTED, LIME, HEAD, BODY, PublicTag } from "../lib/publicTheme"
import { Skeleton } from "../components/Skeleton"

// Real USE Liner® material/performance data (client-supplied GRE product
// brochure) — fixed facts about the product itself, kept separate from
// `Service.specs` (the short admin-editable pill badges) since these are
// standing engineering specifications, not marketing copy.
const GRE_TECH_SPECS = [
  { label: "Liner Material", value: "Glass Reinforced Epoxy (GRE)" },
  { label: "Resin System", value: "Amine-Cured Epoxy" },
  { label: "Compression Ring", value: "Reinforced Nitrile Rubber" },
  { label: "Flow Coefficient", value: "Hazen-Williams 150" },
  { label: "Connections Supported", value: "T&C and Flush Joint (FJ)" },
  { label: "Warranty", value: "12-Month Product Replacement" },
] as const

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

// GRE Liner — flagship service, non-collapsible, above the "Additional
// Services" accordion. Deliberately light on copy: name + one line + spec
// chips, no long paragraph, matching the homepage spotlight's minimal-text
// treatment. Split out of Services() purely to keep that component's own
// line count under Codacy's per-function limit.
function UseLinerSpotlight({
  greService,
  onNavigate,
  t,
  tNav,
}: {
  greService: Service
  onNavigate: (page: string) => void
  t: ReturnType<typeof useTranslations>
  tNav: ReturnType<typeof useTranslations>
}) {
  return (
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
          {greService.longDescription && (
            <p
              style={{
                margin: "14px 0 0",
                fontSize: 14,
                lineHeight: 1.75,
                color: "rgba(255,255,255,0.65)",
                maxWidth: 520,
              }}
            >
              {greService.longDescription}
            </p>
          )}
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
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "14px 24px",
              marginTop: 28,
              paddingTop: 24,
              borderTop: "1px solid rgba(255,255,255,0.14)",
              maxWidth: 520,
            }}
          >
            {GRE_TECH_SPECS.map((row) => (
              <div key={row.label}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "rgba(255,255,255,0.45)",
                  }}
                >
                  {row.label}
                </div>
                <div
                  style={{
                    fontSize: 13.5,
                    fontWeight: 500,
                    color: "#fff",
                    marginTop: 3,
                  }}
                >
                  {row.value}
                </div>
              </div>
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
  )
}

// One collapsible row in the "Additional Services" accordion — separated
// from AdditionalServicesAccordion below purely to keep both functions'
// line counts under Codacy's per-function limit, not because either is
// reused elsewhere.
function AccordionRow({
  svc,
  index,
  isActive,
  onToggle,
  onNavigate,
  t,
  tNav,
}: {
  svc: Service
  index: number
  isActive: boolean
  onToggle: () => void
  onNavigate: (page: string) => void
  t: ReturnType<typeof useTranslations>
  tNav: ReturnType<typeof useTranslations>
}) {
  return (
    <div
      className="reveal"
      style={{
        border: "1px solid #E6E5E0",
        borderRadius: 20,
        overflow: "hidden",
        transitionDelay: `${index * 0.06}s`,
      }}
    >
      {}
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          background: isActive ? "rgba(216,255,62,0.18)" : "#fff",
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
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              fontFamily: "ui-monospace,monospace",
              fontSize: 11,
              color: isActive ? TEXT : MUTED,
              fontWeight: 700,
              letterSpacing: "0.1em",
              flexShrink: 0,
            }}
          >
            SVC-0{index + 1}
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
            background: isActive ? LIME : PAPER,
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
              transform: isActive ? "rotate(45deg)" : "none",
              display: "inline-block",
              transition: "transform 0.2s",
            }}
          >
            +
          </span>
        </div>
      </button>

      {}
      {isActive && (
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
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
  )
}

function AdditionalServicesAccordion({
  otherServices,
  loading,
  loadState,
  onNavigate,
  translations,
}: {
  otherServices: Service[]
  loading: boolean
  loadState: {
    error: string | null
    clearError: (msg: string | null) => void
    retry: () => void
  }
  onNavigate: (page: string) => void
  translations: {
    t: ReturnType<typeof useTranslations>
    tNav: ReturnType<typeof useTranslations>
    tCommon: ReturnType<typeof useTranslations>
  }
}) {
  const [active, setActive] = useState<number | null>(null)
  const { t, tNav, tCommon } = translations

  return (
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
          message={loadState.error}
          onDismiss={() => loadState.clearError(null)}
          dismissLabel={tCommon("errors.dismiss")}
          onRetry={loadState.retry}
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
          <AccordionRow
            key={svc.id}
            svc={svc}
            index={i}
            isActive={active === i}
            onToggle={() => setActive(active === i ? null : i)}
            onNavigate={onNavigate}
            t={t}
            tNav={tNav}
          />
        ))}
      </div>
    </section>
  )
}

export default function Services({ onNavigate, initialServices }: Props) {
  useReveal()
  const t = useTranslations("servicesPage")
  const tNav = useTranslations("nav")
  const locale = useLocale()
  const [services, setServices] = useState<Service[]>(initialServices ?? [])
  // GRE gets a dedicated, non-collapsible featured section above the
  // accordion (client direction: GRE is the flagship service, everything
  // else is secondary) — the same "Additional Services" split already
  // shipped on the homepage (views/Home.tsx).
  // Public "Additional Services" catalog is an explicit allowlist (kept
  // even though it now matches "everything except GRE") so a future
  // draft/internal-only service added to the DB doesn't show up here
  // just by existing.
  const PUBLIC_ADDITIONAL_SERVICE_SLUGS = [
    "industrial-coating",
    "hdpe-lining",
    "rtp-systems",
    "rtv-insulator-coating",
  ]
  const greService = services.find((s) => s.slug === "gre-tubular-lining")
  const otherServices = services.filter((s) =>
    PUBLIC_ADDITIONAL_SERVICE_SLUGS.includes(s.slug),
  )
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
  }, [locale, loadFailedMsg, setLoadError])

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
          background: "#fff",
          padding: "88px 28px 64px",
        }}
      >
        <div
          className="responsive-card-grid"
          style={{
            maxWidth: 1260,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1.3fr 1fr",
            gap: 48,
            alignItems: "center",
          }}
        >
          <div>
            <PublicTag>{t("eyebrow")}</PublicTag>
            <h1
              style={{
                fontFamily: HEAD,
                fontSize: "clamp(36px, 5vw, 64px)",
                fontWeight: 700,
                color: TEXT,
                letterSpacing: "-0.02em",
                margin: "20px 0 20px",
                maxWidth: 700,
              }}
            >
              {t("title")}
            </h1>
            <p
              style={{
                fontSize: 17,
                color: MUTED,
                maxWidth: 540,
                lineHeight: 1.7,
              }}
            >
              {t("subtitle")}
            </p>
          </div>
          {(greService || otherServices.length > 0) && (
            <div
              style={{
                border: "1px solid #E6E5E0",
                borderRadius: 20,
                padding: "8px 24px",
              }}
            >
              {[...(greService ? [greService] : []), ...otherServices].map((svc, i, arr) => (
                <div
                  key={svc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "16px 0",
                    borderBottom: i < arr.length - 1 ? "1px solid #E6E5E0" : "none",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "ui-monospace,monospace",
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: MUTED,
                      flexShrink: 0,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    style={{
                      fontFamily: HEAD,
                      fontSize: 15,
                      fontWeight: 600,
                      color: TEXT,
                    }}
                  >
                    {svc.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {greService && (
        <UseLinerSpotlight greService={greService} onNavigate={onNavigate} t={t} tNav={tNav} />
      )}

      <AdditionalServicesAccordion
        otherServices={otherServices}
        loading={loading}
        loadState={{ error: loadError, clearError: setLoadError, retry: load }}
        onNavigate={onNavigate}
        translations={{ t, tNav, tCommon }}
      />

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
