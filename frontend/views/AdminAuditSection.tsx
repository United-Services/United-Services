"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { usePaginatedList } from "../lib/usePaginatedList"
import { fmtDateTime, tableHead, TableSkeletonRows, LoadMoreButton, SearchBox } from "./adminShared"

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
}

export default function AdminAuditSection({ setError }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const authed = async () => authHeader(await getToken())

  const onListError = (err: unknown) =>
    setError(getErrorMessage(err, tCommon("errors.loadFailed")))
  const auditLogList = usePaginatedList<AuditLogRow>(onListError)

  const [auditQuery, setAuditQuery] = useState("")

  const auditLogFetchPage =
    (q: string) => async (skip: number, take: number) => {
      const headers = await authed()
      const { data } = await axios.get("/audit-log", {
        headers,
        params: { q: q || undefined, skip, take },
      })
      return data
    }
  const loadAuditLog = (q = "") => auditLogList.reload(auditLogFetchPage(q))
  const loadMoreAuditLog = () =>
    auditLogList.loadMore(auditLogFetchPage(auditQuery))

  useEffect(() => {
    loadAuditLog()
  }, [])

  return (
    <>
      <SearchBox
        value={auditQuery}
        onChange={setAuditQuery}
        onSearch={() => loadAuditLog(auditQuery)}
        placeholder={t("audit.searchPlaceholder")}
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
          {tableHead(t.raw("audit.cols"))}
          {auditLogList.initialLoading ? (
            <TableSkeletonRows cols={t.raw("audit.cols").length} />
          ) : (
          <tbody>
            {auditLogList.items.map((a, i) => (
              <tr
                key={a.id}
                style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}
              >
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 13,
                    color: palette.navy,
                    fontWeight: 600,
                  }}
                >
                  {a.actor.firstName} {a.actor.lastName}{" "}
                  <span
                    style={{ color: palette.muted, fontWeight: 400 }}
                  >
                    ({a.actor.role})
                  </span>
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 12,
                    color: palette.navy,
                    fontWeight: 600,
                  }}
                >
                  {a.action}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 12,
                    color: palette.muted,
                  }}
                >
                  {a.targetType} · {a.targetId.slice(0, 8)}…
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 12,
                    color: palette.muted,
                  }}
                >
                  {fmtDateTime(a.createdAt)}
                </td>
              </tr>
            ))}
            {auditLogList.items.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    fontSize: 13,
                    color: palette.muted,
                  }}
                >
                  {t("audit.none")}
                </td>
              </tr>
            )}
          </tbody>
          )}
        </table>
        <LoadMoreButton
          hasMore={auditLogList.hasMore}
          loading={auditLogList.loadingMore}
          onClick={loadMoreAuditLog}
        />
      </div>
    </>
  )
}
