"use client"
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import PublicNav from "../components/PublicNav"
import PublicFooter from "../components/PublicFooter"
import { useReveal } from "../hooks/useReveal"
import { api } from "../lib/api"

interface Props {
  onNavigate: (page: string, param?: string) => void
}

interface OpenPosition {
  id: string
  title: string
  description: string
  department: string
}

const ALL = "All"

export default function Careers({ onNavigate }: Props) {
  useReveal()
  const t = useTranslations("careers")
  const [positions, setPositions] = useState<OpenPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>(ALL)

  useEffect(() => {
    api
      .get("/positions")
      .then(({ data }) => setPositions(data))
      .finally(() => setLoading(false))
  }, [])

  const departments = [
    ALL,
    ...Array.from(new Set(positions.map((p) => p.department))),
  ]
  const filtered =
    filter === ALL
      ? positions
      : positions.filter((p) => p.department === filter)

  return (
    <div style={{ fontFamily: "Poppins, sans-serif", background: "#fff" }}>
      <PublicNav current="careers" onNavigate={onNavigate} />

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
              marginBottom: 20,
            }}
          >
            {t("title")}
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "#94A3B8",
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
                    background: filter === dept ? palette.accent : "#F8FAFC",
                    color: filter === dept ? "#fff" : palette.slate,
                    border: `1.5px solid ${
                      filter === dept ? palette.accent : "#E2E8F0"
                    }`,
                    borderRadius: 9999,
                    padding: "8px 20px",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "Poppins, sans-serif",
                    transition: "all 0.15s",
                  }}
                >
                  {dept === ALL ? t("filterAll") : dept}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {!loading && positions.length === 0 && (
              <p
                style={{
                  fontSize: 14,
                  color: palette.muted,
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
                  border: "1px solid #E2E8F0",
                  borderRadius: 16,
                  padding: "24px 28px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
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
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      color: palette.muted,
                      marginBottom: 6,
                    }}
                  >
                    {p.department}
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      color: palette.navy,
                      marginBottom: 4,
                    }}
                  >
                    {p.title}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: palette.slate,
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
                    background: "#4B5563",
                    color: "#fff",
                    border: "none",
                    borderRadius: 9999,
                    padding: "10px 22px",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "Poppins, sans-serif",
                    transition: "background 0.2s",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      "#374151"
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      "#4B5563"
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
