"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { usePaginatedList } from "../lib/usePaginatedList"
import { fmtDate, fmtDateTime, StatusBadge, tableHead, TableSkeletonRows, LoadMoreButton, SearchBox } from "./adminShared"

interface RfqRow {
  id: string
  status: string
  contactedAt: string | null
  createdAt: string
  projectDetails: string
  client: {
    firstName: string
    lastName: string
    email: string
    companyName: string | null
  }
  service: { name: string } | null
}

interface Props {
  setError: (message: string | null) => void
}

export default function AdminRfqsSection({ setError }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const authed = async () => authHeader(await getToken())

  const onListError = (err: unknown) =>
    setError(getErrorMessage(err, tCommon("errors.loadFailed")))
  const rfqsList = usePaginatedList<RfqRow>(onListError)

  const [viewingRfq, setViewingRfq] = useState<RfqRow | null>(null)
  const [rfqQuery, setRfqQuery] = useState("")

  const rfqsFetchPage = (q: string) => async (skip: number, take: number) => {
    const headers = await authed()
    const { data } = await axios.get("/rfqs", {
      headers,
      params: { q: q || undefined, skip, take },
    })
    return data
  }
  const loadRfqs = (q = "") => rfqsList.reload(rfqsFetchPage(q))
  const loadMoreRfqs = () => rfqsList.loadMore(rfqsFetchPage(rfqQuery))

  useEffect(() => {
    loadRfqs()
  }, [])

  // One-way — the backend rejects a second call once contactedAt is
  // already set, so this is the point of no return for a request. The
  // confirm() is the only chance to back out.
  const markRfqContacted = async (id: string) => {
    if (!window.confirm(t("rfqs.confirmContacted"))) return
    try {
      const headers = await authed()
      await axios.patch(`/rfqs/${id}/contacted`, {}, { headers })
      loadRfqs(rfqQuery)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }
  const setRfqStatus = async (id: string, status: "pending" | "in_review") => {
    try {
      const headers = await authed()
      await axios.patch(`/rfqs/${id}/status`, { status }, { headers })
      loadRfqs(rfqQuery)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  return (
    <>
      <SearchBox
        value={rfqQuery}
        onChange={setRfqQuery}
        onSearch={() => loadRfqs(rfqQuery)}
        placeholder={t("rfqs.searchPlaceholder")}
      />
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #E6E5E0",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          {tableHead(t.raw("rfqs.cols"))}
          {rfqsList.initialLoading ? (
            <TableSkeletonRows cols={t.raw("rfqs.cols").length} />
          ) : (
          <tbody>
            {rfqsList.items.map((r, i) => (
              <tr
                key={r.id}
                onClick={() => setViewingRfq(r)}
                style={{
                  background: i % 2 === 0 ? "#fff" : "#FAFAFA",
                  cursor: "pointer",
                }}
              >
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 13,
                    color: palette.navy,
                    fontWeight: 600,
                  }}
                >
                  {r.client.firstName} {r.client.lastName}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 13,
                    color: palette.slate,
                  }}
                >
                  {r.client.companyName ?? "—"}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 12,
                    color: palette.navy,
                    fontWeight: 600,
                  }}
                >
                  {r.service?.name ?? t("rfqs.general")}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 12,
                    color: palette.muted,
                  }}
                >
                  {fmtDate(r.createdAt)}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <StatusBadge
                    status={r.contactedAt ? "contacted" : r.status}
                  />
                </td>
                <td style={{ padding: "14px 16px" }}>
                  {r.contactedAt ? (
                    <span style={{ fontSize: 12, color: palette.muted }}>
                      —
                    </span>
                  ) : (
                    <div style={{ display: "flex", gap: 6 }}>
                      {r.status === "pending" ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setRfqStatus(r.id, "in_review")
                          }}
                          style={{
                            background: "#DBEAFE",
                            color: "#1E40AF",
                            border: "none",
                            borderRadius: 9999,
                            padding: "5px 14px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "Poppins, sans-serif",
                          }}
                        >
                          {t("rfqs.markInReview")}
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setRfqStatus(r.id, "pending")
                          }}
                          style={{
                            background: "#F3F2EE",
                            color: "#475569",
                            border: "none",
                            borderRadius: 9999,
                            padding: "5px 14px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "Poppins, sans-serif",
                          }}
                        >
                          {t("rfqs.markUncontacted")}
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          markRfqContacted(r.id)
                        }}
                        style={{
                          background: "#DCFCE7",
                          color: "#166534",
                          border: "none",
                          borderRadius: 9999,
                          padding: "5px 14px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "Poppins, sans-serif",
                        }}
                      >
                        {t("rfqs.markContacted")}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rfqsList.items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    fontSize: 13,
                    color: palette.muted,
                  }}
                >
                  {t("rfqs.none")}
                </td>
              </tr>
            )}
          </tbody>
          )}
        </table>
        <LoadMoreButton
          hasMore={rfqsList.hasMore}
          loading={rfqsList.loadingMore}
          onClick={loadMoreRfqs}
        />
      </div>

      {viewingRfq && (
        <div
          onClick={() => setViewingRfq(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 20,
              padding: 32,
              maxWidth: 560,
              width: "100%",
              maxHeight: "85vh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: 20,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: palette.navy,
                  }}
                >
                  {viewingRfq.client.firstName}{" "}
                  {viewingRfq.client.lastName}
                </div>
                <div style={{ fontSize: 13, color: palette.muted }}>
                  {viewingRfq.client.companyName ?? "—"}
                </div>
              </div>
              <button
                onClick={() => setViewingRfq(null)}
                aria-label={t("rfqs.close")}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  color: palette.muted,
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
                marginBottom: 20,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: palette.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  {t("rfqs.detail.email")}
                </div>
                <div style={{ fontSize: 13, color: palette.navy }}>
                  {viewingRfq.client.email}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: palette.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  {t("rfqs.detail.service")}
                </div>
                <div style={{ fontSize: 13, color: palette.navy }}>
                  {viewingRfq.service?.name ?? t("rfqs.general")}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: palette.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  {t("rfqs.detail.submitted")}
                </div>
                <div style={{ fontSize: 13, color: palette.navy }}>
                  {fmtDateTime(viewingRfq.createdAt)}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: palette.muted,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 4,
                  }}
                >
                  {t("rfqs.detail.status")}
                </div>
                <StatusBadge
                  status={
                    viewingRfq.contactedAt
                      ? "contacted"
                      : viewingRfq.status
                  }
                />
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: palette.muted,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginBottom: 6,
                }}
              >
                {t("rfqs.detail.projectDetails")}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: palette.slate,
                  lineHeight: 1.7,
                  whiteSpace: "pre-wrap",
                  background: "#F3F2EE",
                  border: "1px solid #E6E5E0",
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                {viewingRfq.projectDetails}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
