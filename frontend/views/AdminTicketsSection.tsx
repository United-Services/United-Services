"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { usePaginatedList } from "../lib/usePaginatedList"
import { fmtDateTime, tableHead, TableSkeletonRows, LoadMoreButton } from "./adminShared"

type TicketType = "technical" | "disabled_account" | "non_technical"

interface TicketRow {
  id: string
  name: string
  email: string
  company: string | null
  type: TicketType
  details: string
  screenshotUrl: string | null
  createdAt: string
  contactedAt: string | null
}

interface Props {
  setError: (message: string | null) => void
}

const TYPE_BADGE: Record<TicketType, { bg: string; color: string; label: string }> = {
  technical: { bg: "#FEE2E2", color: "#991B1B", label: "Technical" },
  disabled_account: { bg: "#FEF3C7", color: "#92400E", label: "Disabled account" },
  non_technical: { bg: "#F3F2EE", color: "#475569", label: "Other" },
}

export default function AdminTicketsSection({ setError }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const authed = async () => authHeader(await getToken())

  const onListError = (err: unknown) =>
    setError(getErrorMessage(err, tCommon("errors.loadFailed")))
  const ticketsList = usePaginatedList<TicketRow>(onListError)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const ticketsFetchPage = () => async (skip: number, take: number) => {
    const headers = await authed()
    const { data } = await axios.get("/tickets", { headers, params: { skip, take } })
    return data
  }
  const loadTickets = () => ticketsList.reload(ticketsFetchPage())
  const loadMoreTickets = () => ticketsList.loadMore(ticketsFetchPage())

  useEffect(() => {
    loadTickets()
  }, [])

  const toggleContacted = async (id: string) => {
    setBusyId(id)
    try {
      const headers = await authed()
      const { data } = await axios.patch(`/tickets/${id}/contacted`, {}, { headers })
      ticketsList.setItems((prev) => prev.map((row) => (row.id === id ? { ...row, ...data } : row)))
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setBusyId(null)
    }
  }

  const resolveTicket = async (id: string) => {
    if (!window.confirm(t("tickets.resolveConfirm"))) return
    setBusyId(id)
    try {
      const headers = await authed()
      await axios.delete(`/tickets/${id}`, { headers })
      ticketsList.setItems((prev) => prev.filter((row) => row.id !== id))
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
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
                          background: row.contactedAt ? "#DCFCE7" : "#F3F2EE",
                          color: row.contactedAt ? "#166534" : "#475569",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.contactedAt ? t("tickets.contacted") : t("tickets.uncontacted")}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() => toggleContacted(row.id)}
                          disabled={busyId === row.id}
                          style={{
                            background: "#F3F2EE",
                            color: palette.navy,
                            border: "none",
                            borderRadius: 9999,
                            padding: "5px 12px",
                            fontSize: 11.5,
                            fontWeight: 600,
                            cursor: busyId === row.id ? "default" : "pointer",
                            fontFamily: "Poppins, sans-serif",
                          }}
                        >
                          {row.contactedAt ? t("tickets.markUncontacted") : t("tickets.markContacted")}
                        </button>
                        <button
                          onClick={() => resolveTicket(row.id)}
                          disabled={busyId === row.id}
                          style={{
                            background: "#166534",
                            color: "#fff",
                            border: "none",
                            borderRadius: 9999,
                            padding: "5px 12px",
                            fontSize: 11.5,
                            fontWeight: 600,
                            cursor: busyId === row.id ? "default" : "pointer",
                            fontFamily: "Poppins, sans-serif",
                          }}
                        >
                          {t("tickets.resolve")}
                        </button>
                      </div>
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
