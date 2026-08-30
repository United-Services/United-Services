"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import WorldMap from "../components/WorldMap"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { useRequestGuard } from "../lib/useRequestGuard"
import { fmtDateTime } from "./adminShared"
import { Skeleton, SkeletonRows } from "../components/Skeleton"

interface CountRow {
  eventType?: string
  status?: string
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
}
interface AuditLogRow {
  id: string
  action: string
  targetType: string
  targetId: string
  createdAt: string
  actor: { firstName: string; lastName: string; email: string; role: string }
}

interface Props {
  setError: (message: string | null) => void
  // Both undefined for a plain admin — the Recent Activity card (backed
  // by GET /audit-log, super_admin-only on the backend) doesn't render
  // at all in that case, so there's nothing to wire a click handler to.
  isSuperAdmin: boolean
  onViewAuditLog?: () => void
}

export default function AdminOverviewSection({
  setError,
  isSuperAdmin,
  onViewAuditLog,
}: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const authed = async () => authHeader(await getToken())

  const [overview, setOverview] = useState<Overview | null>(null)
  const [geoOverview, setGeoOverview] = useState<
    { country: string; count: number }[]
  >([])
  const [recentActivity, setRecentActivity] = useState<AuditLogRow[]>([])

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
  const loadGeoOverview = async () => {
    try {
      const headers = await authed()
      const { data } = await axios.get("/analytics/geo-overview", { headers })
      setGeoOverview(data.countries)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    }
  }
  const loadRecentActivity = async () => {
    try {
      const headers = await authed()
      const { data } = await axios.get("/audit-log", {
        headers,
        params: { skip: 0, take: 6 },
      })
      setRecentActivity(data.items ?? data)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    }
  }

  useEffect(() => {
    // Standard fetch-on-mount (react.dev/learn/you-might-not-need-an-effect
    // explicitly endorses this shape): each load* function is async and
    // only touches state after its own await, so nothing here sets state
    // synchronously during this effect's own execution.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOverview()
    loadGeoOverview()
    // GET /audit-log is super_admin-only on the backend (see
    // AuditLogController) — a plain admin calling it would just 403 and
    // trip setError with a misleading "load failed" for a card that isn't
    // even rendered below, so skip the call entirely rather than let it
    // fail loudly for no reason.
    if (isSuperAdmin) loadRecentActivity()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin])

  if (!overview) {
    return (
      <div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 32,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: "20px 22px",
                border: "1px solid #E6E5E0",
              }}
            >
              <Skeleton height={11} width="60%" style={{ marginBottom: 12 }} />
              <Skeleton height={32} width="40%" style={{ marginBottom: 8 }} />
              <Skeleton height={11} width="70%" />
            </div>
          ))}
        </div>
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 24,
            border: "1px solid #E6E5E0",
            marginBottom: 24,
          }}
        >
          <Skeleton height={13} width={180} style={{ marginBottom: 16 }} />
          <Skeleton height={240} />
        </div>
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 24,
            border: "1px solid #E6E5E0",
          }}
        >
          <Skeleton height={13} width={140} style={{ marginBottom: 16 }} />
          <SkeletonRows count={4} withAvatar={false} />
        </div>
      </div>
    )
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 32,
        }}
      >
        {[
          {
            label: t("overview.clients"),
            value: overview.clientCount,
            sub: t("overview.companiesSub", {
              count: overview.companyCount,
            }),
          },
          {
            label: t("overview.fileRequests"),
            value: overview.fileAccessRequested,
            sub: t("overview.approvedSub", {
              count: overview.fileAccessApproved,
            }),
          },
          {
            label: t("overview.rfqs"),
            value: overview.rfqCount,
            sub: t("overview.totalSubmitted"),
          },
          {
            label: t("overview.appointments"),
            value: overview.appointmentCount,
            sub: t("overview.totalBooked"),
          },
        ].map((c) => (
          <div
            key={c.label}
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "20px 22px",
              border: "1px solid #E6E5E0",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: palette.muted,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
              }}
            >
              {c.label}
            </div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: palette.navy,
                lineHeight: 1,
                marginBottom: 6,
              }}
            >
              {c.value}
            </div>
            <div style={{ fontSize: 12, color: palette.muted }}>{c.sub}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "24px",
          border: "1px solid #E6E5E0",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: palette.navy,
            marginBottom: 4,
          }}
        >
          {t("overview.requestsByCountry")}
        </div>
        <div
          style={{
            fontSize: 12,
            color: palette.muted,
            marginBottom: 16,
          }}
        >
          {t("overview.requestsByCountrySub")}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: 24,
            alignItems: "start",
          }}
          className="responsive-card-grid"
        >
          <WorldMap
            data={geoOverview}
            noDataLabel={t("overview.noRequests")}
            requestsLabel={t("overview.requests")}
          />
          <div>
            {geoOverview.length === 0 && (
              <div style={{ fontSize: 13, color: palette.muted }}>
                {t("overview.noGeoData")}
              </div>
            )}
            {geoOverview.slice(0, 8).map((row) => (
              <div
                key={row.country}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid #F3F2EE",
                  fontSize: 13,
                }}
              >
                <span style={{ color: palette.slate, fontWeight: 600 }}>
                  {row.country}
                </span>
                <span style={{ color: palette.navy, fontWeight: 700 }}>
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {isSuperAdmin && (
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "24px",
          border: "1px solid #E6E5E0",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: palette.navy,
            marginBottom: 16,
          }}
        >
          {t("overview.recentActivity")}
        </div>
        {recentActivity.slice(0, 6).map((a) => (
          <div
            key={a.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "12px 0",
              borderBottom: "1px solid #F3F2EE",
            }}
          >
            <div style={{ flex: 1, fontSize: 13, color: palette.slate }}>
              <strong>
                {a.actor.firstName} {a.actor.lastName}
              </strong>{" "}
              — {a.action.replace(/_/g, " ").replace(/\./g, " ")}
            </div>
            <div style={{ fontSize: 12, color: palette.muted }}>
              {fmtDateTime(a.createdAt)}
            </div>
          </div>
        ))}
        {recentActivity.length === 0 && (
          <div style={{ fontSize: 13, color: palette.muted }}>
            {t("overview.noActivity")}
          </div>
        )}
        <button
          onClick={onViewAuditLog}
          style={{
            marginTop: 12,
            background: "none",
            border: "none",
            color: palette.navy,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          {t("overview.viewFullLog")}
        </button>
      </div>
      )}
    </div>
  )
}
