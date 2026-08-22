"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { useRequestGuard } from "../lib/useRequestGuard"
import { Skeleton } from "../components/Skeleton"

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

interface Props {
  setError: (message: string | null) => void
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}>
        {Array.from({ length: 3 }).map((_, i) => (
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
            <Skeleton height={11} width={280} style={{ marginBottom: 16 }} />
            <Skeleton height={220} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: 24,
      }}
    >
      {[
        {
          title: t("analytics.candidatesByStatus"),
          sub: t("analytics.candidatesByStatusSub"),
          data: overview.candidatesByStatus.map((c) => ({
            label: c.status ?? "",
            count: c.count,
          })),
          empty: t("analytics.noCandidates"),
        },
        {
          title: t("analytics.ctaClicks"),
          sub: t("analytics.ctaClicksSub"),
          data: overview.ctaClicks.map((c) => ({
            label: (c.eventType ?? "")
              .replace(/^cta_click_?/, "")
              .replace(/_/g, " "),
            count: c.count,
          })),
          empty: t("analytics.noEvents"),
        },
        {
          title: t("analytics.serviceViews"),
          sub: t("analytics.serviceViewsSub"),
          data: overview.serviceViews.map((c) => ({
            label: (c.eventType ?? "")
              .replace(/^service_page_view_?/, "")
              .replace(/-/g, " "),
            count: c.count,
          })),
          empty: t("analytics.noEvents"),
        },
      ].map((chart) => (
        <div
          key={chart.title}
          style={{
            background: "#fff",
            borderRadius: 16,
            padding: 24,
            border: "1px solid #E6E5E0",
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
            {chart.title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: palette.muted,
              marginBottom: 16,
            }}
          >
            {chart.sub}
          </div>
          {chart.data.length === 0 ? (
            <div style={{ fontSize: 13, color: palette.muted }}>
              {chart.empty}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chart.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F2EE" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: palette.muted }}
                  style={{ fontFamily: "Poppins, sans-serif" }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: palette.muted }}
                  style={{ fontFamily: "Poppins, sans-serif" }}
                />
                <Tooltip
                  contentStyle={{
                    fontFamily: "Poppins, sans-serif",
                    fontSize: 12,
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="count" fill={palette.accent} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      ))}
    </div>
  )
}
