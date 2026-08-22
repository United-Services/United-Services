"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { usePaginatedList } from "../lib/usePaginatedList"
import { FileAccessStatus } from "../enums/status.enums"
import { fmtDate, ActionPair, tableHead, TableSkeletonRows, LoadMoreButton, SearchBox } from "./adminShared"

interface FileRequestRow {
  id: string
  status: FileAccessStatus
  requestedAt: string
  client: {
    firstName: string
    lastName: string
    email: string
    companyName: string | null
  }
  serviceFile: {
    id: string
    originalFilename: string
    service: { name: string; slug: string }
  }
}

interface Props {
  setError: (message: string | null) => void
}

export default function AdminRequestsSection({ setError }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const authed = async () => authHeader(await getToken())

  const onListError = (err: unknown) =>
    setError(getErrorMessage(err, tCommon("errors.loadFailed")))
  const requestsList = usePaginatedList<FileRequestRow>(onListError)

  const [requestQuery, setRequestQuery] = useState("")

  const requestsFetchPage = (q: string) => async (skip: number, take: number) => {
    const headers = await authed()
    const { data } = await axios.get("/file-access-requests", {
      headers,
      params: { q: q || undefined, skip, take },
    })
    return data
  }
  const loadRequests = (q = "") => requestsList.reload(requestsFetchPage(q))
  const loadMoreRequests = () =>
    requestsList.loadMore(requestsFetchPage(requestQuery))

  useEffect(() => {
    loadRequests()
  }, [])

  const decideRequest = async (id: string, approve: boolean) => {
    try {
      const headers = await authed()
      await axios.post(`/file-access-requests/${id}/decide`, { approve }, {
        headers,
      })
      loadRequests(requestQuery)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  return (
    <>
      <SearchBox
        value={requestQuery}
        onChange={setRequestQuery}
        onSearch={() => loadRequests(requestQuery)}
        placeholder={t("requests.searchPlaceholder")}
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
          {tableHead(t.raw("requests.cols"))}
          {requestsList.initialLoading ? (
            <TableSkeletonRows cols={t.raw("requests.cols").length} />
          ) : (
          <tbody>
            {requestsList.items.map((r, i) => (
              <tr
                key={r.id}
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
                    color: palette.accent,
                    fontWeight: 600,
                  }}
                >
                  {r.serviceFile.originalFilename} (
                  {r.serviceFile.service.name})
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 12,
                    color: palette.muted,
                  }}
                >
                  {fmtDate(r.requestedAt)}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <ActionPair
                    status={r.status}
                    onApprove={() => decideRequest(r.id, true)}
                    onDeny={() => decideRequest(r.id, false)}
                  />
                </td>
              </tr>
            ))}
            {requestsList.items.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 24,
                    textAlign: "center",
                    fontSize: 13,
                    color: palette.muted,
                  }}
                >
                  {t("requests.none")}
                </td>
              </tr>
            )}
          </tbody>
          )}
        </table>
        <LoadMoreButton
          hasMore={requestsList.hasMore}
          loading={requestsList.loadingMore}
          onClick={loadMoreRequests}
        />
      </div>
    </>
  )
}
