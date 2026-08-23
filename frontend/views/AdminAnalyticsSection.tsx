"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { useRequestGuard } from "../lib/useRequestGuard"
import { Skeleton } from "../components/Skeleton"

interface CountRow {
  eventType?: string
  status?: string
  type?: string
  count: number
}
interface Overview {
  clientCount: number
  companyCount: number
  fileAccessRequested: number
  fileAccessApproved: number
  rfqCount: number
  appointmentCount: number
  candidatesByStatus: CountRow[]
  ctaClicks: CountRow[]
  serviceViews: CountRow[]
  ticketsByStatus: CountRow[]
  ticketsByType: CountRow[]
}

interface Props {
  setError: (message: string | null) => void
}

interface BarDatum {
  label: string
  count: number
  color?: string
}

// A single thin, rounded, directly-labeled bar — replaces the previous
// recharts axis-and-gridline bar chart with something readable at a
// glance without needing to read axis ticks first. One color per row
// when the rows carry distinct meaning (e.g. ticket type); a single
// brand hue when they're just one metric split by category.
function RankedBars({ data, emptyLabel }: { data: BarDatum[]; emptyLabel: string }) {
  const [hovered, setHovered] = useState<number | null>(null)
  if (data.length === 0) {
    return <div style={{ fontSize: 13, color: palette.muted }}>{emptyLabel}</div>
  }
  const max = Math.max(1, ...data.map((d) => d.count))
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {data.map((d, i) => (
        <div
          key={d.label}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          style={{ position: "relative" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12.5,
              marginBottom: 5,
            }}
          >
            <span style={{ color: palette.slate, fontWeight: 600, textTransform: "capitalize" }}>
              {d.label}
            </span>
            <span style={{ color: palette.navy, fontWeight: 700 }}>{d.count}</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: palette.bgAlt, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.max(3, (d.count / max) * 100)}%`,
                borderRadius: 999,
                background: d.color ?? palette.accent,
                transition: "width 0.4s ease",
              }}
            />
          </div>
          {hovered === i && (
            <div
              style={{
                position: "absolute",
                top: -30,
                left: 0,
                background: palette.navy,
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 9px",
                borderRadius: 6,
                whiteSpace: "nowrap",
                zIndex: 1,
              }}
            >
              {d.label}: {d.count}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const TICKET_STATUS_COLOR: Record<string, string> = {
  unresolved: "#8C8C88",
  contacted: "#1E40AF",
  resolved: "#166534",
}
const TICKET_TYPE_COLOR: Record<string, string> = {
  technical: "#991B1B",
  disabled_account: "#92400E",
  non_technical: "#475569",
}

function ChartCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 16, padding: 24, border: "1px solid #E6E5E0" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: palette.navy, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: palette.muted, marginBottom: 20 }}>{sub}</div>
      {children}
    </div>
  )
}

export default function AdminAnalyticsSection({ setError }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const authed = async () => authHeader(await getToken())

  const [overview, setOverview] = useState<Overview | null>(null)
  const overviewGuard = useRequestGuard()

  const loadOverview = async () => {
    const reqId = overviewGuard.start()
    try {
      const headers = await authed()
      const { data } = await axios.get("/analytics/overview", { headers })
      if (overviewGuard.stale(reqId)) return
      setOverview(data)
    } catch (err) {
      if (overviewGuard.stale(reqId)) return
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOverview()
  }, [])

  if (!overview) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 24,
              border: "1px solid #E6E5E0",
            }}
          >
            <Skeleton height={13} width={200} style={{ marginBottom: 6 }} />
            <Skeleton height={11} width={280} style={{ marginBottom: 20 }} />
            <Skeleton height={140} />
          </div>
        ))}
      </div>
    )
  }

  const resolvedCount = overview.ticketsByStatus.find((r) => r.status === "resolved")?.count ?? 0
  const unresolvedCount = overview.ticketsByStatus.find((r) => r.status === "unresolved")?.count ?? 0
  const contactedCount = overview.ticketsByStatus.find((r) => r.status === "contacted")?.count ?? 0
  const totalTickets = resolvedCount + unresolvedCount + contactedCount

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <ChartCard title={t("analytics.ticketsByStatus")} sub={t("analytics.ticketsByStatusSub")}>
        {totalTickets === 0 ? (
          <div style={{ fontSize: 13, color: palette.muted }}>{t("analytics.noTickets")}</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
              {(["resolved", "unresolved", "contacted"] as const).map((s) => {
                const count = { resolved: resolvedCount, unresolved: unresolvedCount, contacted: contactedCount }[s]
                return (
                  <div key={s}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: TICKET_STATUS_COLOR[s],
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 11.5, color: palette.muted, fontWeight: 600 }}>
                        {t(`tickets.status.${s}`)}
                      </span>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: palette.navy }}>{count}</div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", gap: 2 }}>
              {(["resolved", "contacted", "unresolved"] as const).map((s) => {
                const count = { resolved: resolvedCount, unresolved: unresolvedCount, contacted: contactedCount }[s]
                if (count === 0) return null
                return (
                  <div
                    key={s}
                    title={`${t(`tickets.status.${s}`)}: ${count}`}
                    style={{
                      width: `${(count / totalTickets) * 100}%`,
                      background: TICKET_STATUS_COLOR[s],
                      borderRadius: 999,
                    }}
                  />
                )
              })}
            </div>
          </>
        )}
      </ChartCard>

      <div className="responsive-card-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <ChartCard title={t("analytics.ticketsByType")} sub={t("analytics.ticketsByTypeSub")}>
          <RankedBars
            data={overview.ticketsByType.map((r) => ({
              label: (r.type ?? "").replace(/_/g, " "),
              count: r.count,
              color: TICKET_TYPE_COLOR[r.type ?? ""],
            }))}
            emptyLabel={t("analytics.noTickets")}
          />
        </ChartCard>

        <ChartCard title={t("analytics.candidatesByStatus")} sub={t("analytics.candidatesByStatusSub")}>
          <RankedBars
            data={overview.candidatesByStatus.map((c) => ({ label: c.status ?? "", count: c.count }))}
            emptyLabel={t("analytics.noCandidates")}
          />
        </ChartCard>

        <ChartCard title={t("analytics.ctaClicks")} sub={t("analytics.ctaClicksSub")}>
          <RankedBars
            data={overview.ctaClicks.map((c) => ({
              label: (c.eventType ?? "").replace(/^cta_click_?/, "").replace(/_/g, " "),
              count: c.count,
            }))}
            emptyLabel={t("analytics.noEvents")}
          />
        </ChartCard>

        <ChartCard title={t("analytics.serviceViews")} sub={t("analytics.serviceViewsSub")}>
          <RankedBars
            data={overview.serviceViews.map((c) => ({
              label: (c.eventType ?? "").replace(/^service_page_view_?/, "").replace(/-/g, " "),
              count: c.count,
            }))}
            emptyLabel={t("analytics.noEvents")}
          />
        </ChartCard>
      </div>
    </div>
  )
}
