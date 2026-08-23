"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { usePaginatedList } from "../lib/usePaginatedList"
import { fmtDateTime, tableHead, TableSkeletonRows, LoadMoreButton, SearchBox } from "./adminShared"

type TicketType = "technical" | "disabled_account" | "non_technical"
type TicketStatus = "unresolved" | "contacted" | "resolved"

interface TicketRow {
  id: string
  name: string
  email: string
  company: string | null
  type: TicketType
  details: string
  screenshotUrl: string | null
  createdAt: string
  status: TicketStatus
}

interface Props {
  setError: (message: string | null) => void
}

const TYPE_BADGE: Record<TicketType, { bg: string; color: string; label: string }> = {
  technical: { bg: "#FEE2E2", color: "#991B1B", label: "Technical" },
  disabled_account: { bg: "#FEF3C7", color: "#92400E", label: "Disabled account" },
  non_technical: { bg: "#F3F2EE", color: "#475569", label: "Other" },
}

const STATUS_BADGE: Record<TicketStatus, { bg: string; color: string }> = {
  unresolved: { bg: "#F3F2EE", color: "#475569" },
  contacted: { bg: "#DBEAFE", color: "#1E40AF" },
  resolved: { bg: "#DCFCE7", color: "#166534" },
}

const STATUS_OPTIONS: TicketStatus[] = ["unresolved", "contacted", "resolved"]

export default function AdminTicketsSection({ setError }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const authed = async () => authHeader(await getToken())

  const onListError = (err: unknown) =>
    setError(getErrorMessage(err, tCommon("errors.loadFailed")))
  const ticketsList = usePaginatedList<TicketRow>(onListError)
  const [query, setQuery] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const ticketsFetchPage = (q: string) => async (skip: number, take: number) => {
    const headers = await authed()
    const { data } = await axios.get("/tickets", { headers, params: { q: q || undefined, skip, take } })
    return data
  }
  const loadTickets = (q = "") => ticketsList.reload(ticketsFetchPage(q))
  const loadMoreTickets = () => ticketsList.loadMore(ticketsFetchPage(query))

  useEffect(() => {
    loadTickets()
  }, [])

  const updateStatus = async (id: string, status: TicketStatus) => {
    setBusyId(id)
    try {
      const headers = await authed()
      const { data } = await axios.patch(`/tickets/${id}/status`, { status }, { headers })
      ticketsList.setItems((prev) => prev.map((row) => (row.id === id ? { ...row, ...data } : row)))
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <SearchBox
        value={query}
        onChange={setQuery}
        onSearch={() => loadTickets(query)}
        placeholder={t("tickets.searchPlaceholder")}
      />
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #E6E5E0",
          overflowX: "auto",
          overflowY: "hidden",
        }}
      >
        <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
          {tableHead(t.raw("tickets.cols"))}
          {ticketsList.initialLoading ? (
            <TableSkeletonRows cols={t.raw("tickets.cols").length} />
          ) : (
            <tbody>
              {ticketsList.items.map((row, i) => {
                const badge = TYPE_BADGE[row.type]
                const statusBadge = STATUS_BADGE[row.status]
                const expanded = expandedId === row.id
                return (
                  <tr key={row.id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: palette.navy, fontWeight: 600 }}>
                      {row.name}
                      {row.company && (
                        <div style={{ fontSize: 11.5, color: palette.muted, fontWeight: 400 }}>{row.company}</div>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13 }}>
                      <a
                        href={`mailto:${row.email}`}
                        style={{ color: palette.navy, textDecoration: "underline" }}
                      >
                        {row.email}
                      </a>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 9999,
                          background: badge.bg,
                          color: badge.color,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: palette.slate, maxWidth: 320 }}>
                      <div
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: expanded ? "unset" : 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          cursor: "pointer",
                        }}
                        onClick={() => setExpandedId(expanded ? null : row.id)}
                        title={t("tickets.clickToExpand")}
                      >
                        {row.details}
                      </div>
                      {row.screenshotUrl && (
                        <a
                          href={row.screenshotUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 11.5, color: palette.accentDark, fontWeight: 600 }}
                        >
                          {t("tickets.viewScreenshot")}
                        </a>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 12, color: palette.muted, whiteSpace: "nowrap" }}>
                      {fmtDateTime(row.createdAt)}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 9999,
                          background: statusBadge.bg,
                          color: statusBadge.color,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t(`tickets.status.${row.status}`)}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <select
                        value={row.status}
                        disabled={busyId === row.id}
                        onChange={(e) => updateStatus(row.id, e.target.value as TicketStatus)}
                        style={{
                          padding: "5px 10px",
                          borderRadius: 8,
                          border: "1.5px solid #E6E5E0",
                          fontSize: 12,
                          fontFamily: "Poppins, sans-serif",
                          color: palette.navy,
                          cursor: busyId === row.id ? "default" : "pointer",
                        }}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {t(`tickets.status.${s}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
              {ticketsList.items.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 24, textAlign: "center", fontSize: 13, color: palette.muted }}>
                    {t("tickets.none")}
                  </td>
                </tr>
              )}
            </tbody>
          )}
        </table>
      </div>
      <LoadMoreButton
        hasMore={ticketsList.hasMore}
        loading={ticketsList.loadingMore}
        onClick={loadMoreTickets}
      />
    </>
  )
}
