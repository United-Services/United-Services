"use client"
import { useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import PublicNav from "../components/PublicNav"
import PublicFooter from "../components/PublicFooter"
import { useReveal } from "../hooks/useReveal"
import { axios } from "../lib/api"
import { INK, PAPER, TEXT, MUTED, LIME, HEAD, BODY } from "../lib/publicTheme"
import dynamic from "next/dynamic"
// See views/About.tsx for why this is dynamic — same heavy, WebGL-only,
// purely decorative dependency.
const ParticleField = dynamic(() => import("../components/three/ParticleField"), { ssr: false })
import { Skeleton } from "../components/Skeleton"

interface Props {
  onNavigate: (page: string, param?: string) => void
  // Server-fetched (see app/[locale]/careers/page.tsx) for the locale the
  // page was first rendered with — seeds initial state so the list is
  // present in the very first HTML instead of appearing only after a
  // client-side round trip. undefined (not just an empty array) is the
  // signal that no server data was available and a client fetch is
  // still needed.
  initialPositions?: OpenPosition[]
}

export interface OpenPosition {
  id: string
  title: string
  description: string
  department: string
  // Only present when a locale param was sent — the backend machine-
  // translates ar/zh on demand (TranslationService) and reports whether
  // this particular position's translation is ready yet or still
  // in-flight; "en" never carries this field, since there's nothing to
  // translate.
  status?: "missing" | "translating" | "translated" | "failed"
}

const ALL = "All"

export default function Careers({ onNavigate, initialPositions }: Props) {
  useReveal()
  const t = useTranslations("careers")
  const locale = useLocale()
  const [positions, setPositions] = useState<OpenPosition[]>(initialPositions ?? [])
  const [loading, setLoading] = useState(initialPositions === undefined)
  const [filter, setFilter] = useState<string>(ALL)
  // Skips exactly one fetch: the mount-time run when the server already
  // supplied this same locale's data. Any subsequent locale change still
  // fetches client-side as before.
  const skipNextFetch = useRef(initialPositions !== undefined)

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false
      return
    }
    // Intentional: re-fetching on locale change should show the loading
    // state immediately, not just on first mount — this isn't the
    // derived-state anti-pattern the rule is meant to catch, it's
    // resetting the UI for a genuinely new request.
    setLoading(true)
    axios
      .get("/positions", { params: locale !== "en" ? { locale } : undefined })
      .then(({ data }) => setPositions(data))
      .finally(() => setLoading(false))
  }, [locale])

  const departments = [
    ALL,
    ...Array.from(new Set(positions.map((p) => p.department))),
  ]
  const filtered =
    filter === ALL
      ? positions
      : positions.filter((p) => p.department === filter)

  return (
    <div style={{ fontFamily: BODY, background: PAPER, color: TEXT }}>
      <PublicNav current="careers" onNavigate={onNavigate} />

      <section style={{ position: "relative", background: INK, padding: "120px 28px 80px", overflow: "hidden" }}>
        <ParticleField color={LIME} count={160} />
        <div style={{ position: "relative", maxWidth: 1260, margin: "0 auto" }}>
          <h1
            style={{
              fontFamily: HEAD,
              fontSize: "clamp(36px, 5vw, 64px)",
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.02em",
              maxWidth: 640,
              lineHeight: 1.05,
              marginBottom: 20,
            }}
          >
            {t("title")}
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "#A9A9A9",
              maxWidth: 500,
              lineHeight: 1.7,
            }}
          >
            {t("subtitle")}
          </p>
        </div>
      </section>

      <section style={{ padding: "72px 28px" }}>
        <div style={{ maxWidth: 1260, margin: "0 auto" }}>
          {!loading && positions.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 40,
                flexWrap: "wrap",
              }}
            >
              {departments.map((dept) => (
                <button
                  key={dept}
                  onClick={() => setFilter(dept)}
                  style={{
                    background: filter === dept ? LIME : "#fff",
                    color: TEXT,
                    border: `1.5px solid ${filter === dept ? LIME : "#E6E5E0"}`,
                    borderRadius: 9999,
                    padding: "8px 20px",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: BODY,
                    transition: "all 0.15s",
                  }}
                >
                  {dept === ALL ? t("filterAll") : dept}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    border: "1px solid #E6E5E0",
                    borderRadius: 16,
                    padding: 24,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <Skeleton height={16} width="35%" style={{ marginBottom: 10 }} />
                    <Skeleton height={12} width="20%" />
                  </div>
                  <Skeleton height={36} width={100} radius={9999} />
                </div>
              ))}
            {!loading && positions.length === 0 && (
              <p
                style={{
                  fontSize: 14,
                  color: MUTED,
                  textAlign: "center",
                  padding: "48px 0",
                }}
              >
                {t("noOpenings")}
              </p>
            )}
            {filtered.map((p, i) => (
              <div
                key={p.id}
                className="reveal"
                style={{
                  background: "#fff",
                  border: "1px solid #E6E5E0",
                  borderRadius: 16,
                  padding: "24px 28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 24,
                  transitionDelay: `${i * 0.05}s`,
                  transition: "box-shadow 0.2s, transform 0.2s",
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.boxShadow =
                    "0 4px 24px rgba(0,0,0,0.06)"
                  ;(e.currentTarget as HTMLDivElement).style.transform =
                    "translateY(-1px)"
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLDivElement).style.boxShadow = "none"
                  ;(e.currentTarget as HTMLDivElement).style.transform = "none"
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: MUTED,
                      marginBottom: 6,
                    }}
                  >
                    {p.department}
                  </div>
                  <div
                    style={{
                      fontFamily: HEAD,
                      fontSize: 17,
                      fontWeight: 600,
                      color: TEXT,
                      marginBottom: 4,
                    }}
                  >
                    {p.title}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: MUTED,
                      maxWidth: 560,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.description}
                  </div>
                </div>
                <button
                  onClick={() => onNavigate("candidate-signup", p.id)}
                  style={{
                    background: TEXT,
                    color: "#fff",
                    border: "none",
                    borderRadius: 9999,
                    padding: "10px 22px",
                    fontWeight: 500,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: HEAD,
                    transition: "background 0.2s",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      "#2a2a2c"
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      TEXT
                  }}
                >
                  {t("applyNow")}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
