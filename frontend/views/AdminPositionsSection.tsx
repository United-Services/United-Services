"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { InlineSpinner } from "../components/Spinner"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { useRequestGuard } from "../lib/useRequestGuard"
import { fmtDate, StatusBadge, tableHead, TableSkeletonRows } from "./adminShared"

interface PositionRow {
  id: string
  title: string
  description: string
  department: string
  isOpen: boolean
  createdAt: string
}

interface Props {
  setError: (message: string | null) => void
}

export default function AdminPositionsSection({ setError }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const authed = async () => authHeader(await getToken())

  const positionsGuard = useRequestGuard()

  const [positions, setPositions] = useState<PositionRow[]>([])
  const [positionForm, setPositionForm] = useState({
    title: "",
    department: "",
    description: "",
  })
  const [editingPositionId, setEditingPositionId] = useState<string | null>(
    null,
  )
  const [positionSaving, setPositionSaving] = useState(false)
  const [positionsLoading, setPositionsLoading] = useState(true)

  const loadPositions = async () => {
    const reqId = positionsGuard.start()
    try {
      const headers = await authed()
      const { data } = await axios.get("/positions/all", { headers })
      if (positionsGuard.stale(reqId)) return
      setPositions(data)
    } catch (err) {
      if (positionsGuard.stale(reqId)) return
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    } finally {
      if (!positionsGuard.stale(reqId)) setPositionsLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPositions()
  }, [])

  const startEditPosition = (p: PositionRow) => {
    setEditingPositionId(p.id)
    setPositionForm({
      title: p.title,
      department: p.department,
      description: p.description,
    })
  }
  const cancelEditPosition = () => {
    setEditingPositionId(null)
    setPositionForm({ title: "", department: "", description: "" })
  }
  const savePosition = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      !positionForm.title ||
      !positionForm.department ||
      !positionForm.description
    )
      return
    setPositionSaving(true)
    try {
      const headers = await authed()
      if (editingPositionId) {
        await axios.patch(`/positions/${editingPositionId}`, positionForm, {
          headers,
        })
      } else {
        await axios.post("/positions", positionForm, { headers })
      }
      cancelEditPosition()
      loadPositions()
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setPositionSaving(false)
    }
  }
  const togglePositionOpen = async (p: PositionRow) => {
    try {
      const headers = await authed()
      await axios.patch(
        `/positions/${p.id}`,
        { isOpen: !p.isOpen },
        { headers },
      )
      loadPositions()
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  return (
    <>
      <form
        onSubmit={savePosition}
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #E6E5E0",
          padding: 20,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: palette.navy,
            marginBottom: 14,
          }}
        >
          {editingPositionId
            ? t("positions.editHeading")
            : t("positions.createHeading")}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: palette.navy,
                marginBottom: 6,
              }}
            >
              {t("positions.titleLabel")}
            </label>
            <input
              value={positionForm.title}
              onChange={(e) =>
                setPositionForm((f) => ({
                  ...f,
                  title: e.target.value,
                }))
              }
              placeholder={t("positions.titlePlaceholder")}
              required
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 10,
                border: "1.5px solid #E6E5E0",
                fontSize: 13,
                fontFamily: "Poppins, sans-serif",
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: palette.navy,
                marginBottom: 6,
              }}
            >
              {t("positions.departmentLabel")}
            </label>
            <input
              value={positionForm.department}
              onChange={(e) =>
                setPositionForm((f) => ({
                  ...f,
                  department: e.target.value,
                }))
              }
              placeholder={t("positions.departmentPlaceholder")}
              required
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: 10,
                border: "1.5px solid #E6E5E0",
                fontSize: 13,
                fontFamily: "Poppins, sans-serif",
              }}
            />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 600,
              color: palette.navy,
              marginBottom: 6,
            }}
          >
            {t("positions.descriptionLabel")}
          </label>
          <textarea
            value={positionForm.description}
            onChange={(e) =>
              setPositionForm((f) => ({
                ...f,
                description: e.target.value,
              }))
            }
            placeholder={t("positions.descriptionPlaceholder")}
            required
            rows={3}
            style={{
              width: "100%",
              padding: "9px 12px",
              borderRadius: 10,
              border: "1.5px solid #E6E5E0",
              fontSize: 13,
              fontFamily: "Poppins, sans-serif",
              resize: "vertical",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="submit"
            disabled={positionSaving}
            style={{
              padding: "10px 22px",
              borderRadius: 9999,
              border: "none",
              background: palette.accent,
              color: palette.navy,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            {positionSaving ? (
              <>
                <InlineSpinner size={13} /> {t("positions.saving")}
              </>
            ) : editingPositionId ? (
              t("positions.saveChanges")
            ) : (
              t("positions.create")
            )}
          </button>
          {editingPositionId && (
            <button
              type="button"
              onClick={cancelEditPosition}
              style={{
                padding: "10px 22px",
                borderRadius: 9999,
                border: "1.5px solid #E6E5E0",
                background: "#fff",
                color: palette.navy,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
              }}
            >
              {t("positions.cancel")}
            </button>
          )}
        </div>
      </form>

      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #E6E5E0",
          overflow: "hidden",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          {tableHead(t.raw("positions.cols"))}
          {positionsLoading ? (
            <TableSkeletonRows cols={t.raw("positions.cols").length} />
          ) : (
          <tbody>
            {positions.map((p, i) => (
              <tr
                key={p.id}
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
                  {p.title}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 13,
                    color: palette.slate,
                  }}
                >
                  {p.department}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <StatusBadge status={p.isOpen ? "open" : "closed"} />
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 12,
                    color: palette.muted,
                  }}
                >
                  {fmtDate(p.createdAt)}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => startEditPosition(p)}
                      style={{
                        background: "#F3F2EE",
                        color: palette.slate,
                        border: "none",
                        borderRadius: 9999,
                        padding: "5px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      {t("positions.edit")}
                    </button>
                    <button
                      onClick={() => togglePositionOpen(p)}
                      style={{
                        background: p.isOpen ? "#991B1B" : "#166534",
                        color: "#fff",
                        border: "none",
                        borderRadius: 9999,
                        padding: "5px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      {p.isOpen
                        ? t("positions.close")
                        : t("positions.reopen")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {positions.length === 0 && (
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
                  {t("positions.none")}
                </td>
              </tr>
            )}
          </tbody>
          )}
        </table>
      </div>
    </>
  )
}
