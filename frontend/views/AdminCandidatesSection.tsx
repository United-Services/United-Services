"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { usePaginatedList } from "../lib/usePaginatedList"
import { ApplicationStatus } from "../enums/status.enums"
import { fmtDate, ActionPair, tableHead, TableSkeletonRows, LoadMoreButton, SearchBox } from "./adminShared"

interface CandidateRow {
  id: string
  status: ApplicationStatus
  dateOfBirth: string
  documentsRequested: boolean
  candidateUser: { firstName: string; lastName: string; email: string }
  position: { title: string; department: string } | null
}

interface Props {
  setError: (message: string | null) => void
}

export default function AdminCandidatesSection({ setError }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const authed = async () => authHeader(await getToken())

  const onListError = (err: unknown) =>
    setError(getErrorMessage(err, tCommon("errors.loadFailed")))
  const candidatesList = usePaginatedList<CandidateRow>(onListError)

  const [candidateQuery, setCandidateQuery] = useState("")

  const candidatesFetchPage =
    (q: string) => async (skip: number, take: number) => {
      const headers = await authed()
      const { data } = await axios.get("/candidate-applications", {
        headers,
        params: { q: q || undefined, skip, take },
      })
      return data
    }
  const loadCandidates = (q = "") =>
    candidatesList.reload(candidatesFetchPage(q))
  const loadMoreCandidates = () =>
    candidatesList.loadMore(candidatesFetchPage(candidateQuery))

  useEffect(() => {
    loadCandidates()
  }, [])

  const decideCandidate = async (id: string, approve: boolean) => {
    try {
      const headers = await authed()
      await axios.patch(`/candidate-applications/${id}/decide`, { approve }, {
        headers,
      })
      loadCandidates(candidateQuery)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  const viewCandidateDocs = async (id: string) => {
    try {
      const headers = await authed()
      const { data } = await axios.get(
        `/candidate-applications/${id}/documents`,
        { headers },
      )
      // Either document may not be uploaded yet — the candidate dashboard
      // lets them upload ID/CV after signup, not during it. otherDocuments
      // is any number of additional files the candidate attached beyond
      // the fixed ID/CV slots.
      if (data.idPhotoUrl) window.open(data.idPhotoUrl, "_blank")
      if (data.cvUrl) window.open(data.cvUrl, "_blank")
      for (const doc of data.otherDocuments ?? []) {
        window.open(doc.url, "_blank")
      }
      if (!data.idPhotoUrl && !data.cvUrl && !data.otherDocuments?.length) {
        window.alert(t("candidates.noDocsYet"))
      }
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  const requestCandidateDocuments = async (id: string) => {
    const note = window.prompt(t("candidates.requestDocsPrompt")) ?? undefined
    try {
      const headers = await authed()
      await axios.patch(
        `/candidate-applications/${id}/request-documents`,
        { note },
        { headers },
      )
      loadCandidates(candidateQuery)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  return (
    <>
      <SearchBox
        value={candidateQuery}
        onChange={setCandidateQuery}
        onSearch={() => loadCandidates(candidateQuery)}
        placeholder={t("candidates.searchPlaceholder")}
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
          {tableHead(t.raw("candidates.cols"))}
          {candidatesList.initialLoading ? (
            <TableSkeletonRows cols={t.raw("candidates.cols").length} />
          ) : (
          <tbody>
            {candidatesList.items.map((c, i) => (
              <tr
                key={c.id}
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
                  {c.candidateUser.firstName} {c.candidateUser.lastName}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 12,
                    color: palette.slate,
                  }}
                >
                  {c.position?.title ?? "—"}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 12,
                    color: palette.muted,
                  }}
                >
                  {c.candidateUser.email}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 12,
                    color: palette.muted,
                  }}
                >
                  {fmtDate(c.dateOfBirth)}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      alignItems: "flex-start",
                    }}
                  >
                    <button
                      onClick={() => viewCandidateDocs(c.id)}
                      style={{
                        fontSize: 11,
                        background: "#DBEAFE",
                        color: "#1E40AF",
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      {t("candidates.viewDocs")}
                    </button>
                    <button
                      onClick={() => requestCandidateDocuments(c.id)}
                      style={{
                        fontSize: 11,
                        background: c.documentsRequested
                          ? "#FFFBEB"
                          : "#F3F2EE",
                        color: c.documentsRequested
                          ? "#92400E"
                          : palette.slate,
                        borderRadius: 6,
                        padding: "4px 10px",
                        fontWeight: 600,
                        border: "none",
                        cursor: "pointer",
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      {c.documentsRequested
                        ? t("candidates.docsRequested")
                        : t("candidates.requestDocs")}
                    </button>
                  </div>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <ActionPair
                    status={c.status}
                    onApprove={() => decideCandidate(c.id, true)}
                    onDeny={() => decideCandidate(c.id, false)}
                  />
                </td>
              </tr>
            ))}
            {candidatesList.items.length === 0 && (
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
                  {t("candidates.none")}
                </td>
              </tr>
            )}
          </tbody>
          )}
        </table>
        <LoadMoreButton
          hasMore={candidatesList.hasMore}
          loading={candidatesList.loadingMore}
          onClick={loadMoreCandidates}
        />
      </div>
    </>
  )
}
