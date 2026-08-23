"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { useRequestGuard } from "../lib/useRequestGuard"
import { usePaginatedList } from "../lib/usePaginatedList"
import { AppointmentStatus } from "../enums/status.enums"
import { fmtDate, fmtTime, StatusBadge, tableHead, TableSkeletonRows, LoadMoreButton, SearchBox } from "./adminShared"

interface AppointmentRow {
  id: string
  status: AppointmentStatus
  createdAt: string
  slot: { date: string; startTime: string; endTime: string }
  client: { firstName: string; lastName: string; companyName: string | null }
}
interface SlotRow {
  id: string
  date: string
  startTime: string
  endTime: string
  isBooked: boolean
  isClosed: boolean
  appointment: {
    id: string
    status: AppointmentStatus
    client: { firstName: string; lastName: string; companyName: string | null }
  } | null
}

interface Props {
  setError: (message: string | null) => void
}

export default function AdminBookingsSection({ setError }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const authed = async () => authHeader(await getToken())

  const slotsGuard = useRequestGuard()
  const onListError = (err: unknown) =>
    setError(getErrorMessage(err, tCommon("errors.loadFailed")))
  const appointmentsList = usePaginatedList<AppointmentRow>(onListError)

  const [bookingQuery, setBookingQuery] = useState("")
  const [newSlot, setNewSlot] = useState({
    date: "",
    startTime: "",
    endTime: "",
  })
  const [slots, setSlots] = useState<SlotRow[]>([])
  const [slotsLoading, setSlotsLoading] = useState(true)
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [slotEditForm, setSlotEditForm] = useState({
    date: "",
    startTime: "",
    endTime: "",
  })

  const appointmentsFetchPage =
    (q: string) => async (skip: number, take: number) => {
      const headers = await authed()
      const { data } = await axios.get("/appointments", {
        headers,
        params: { q: q || undefined, skip, take },
      })
      return data
    }
  const loadAppointments = (q = "") =>
    appointmentsList.reload(appointmentsFetchPage(q))
  const loadMoreAppointments = () =>
    appointmentsList.loadMore(appointmentsFetchPage(bookingQuery))
  const loadSlots = async () => {
    const reqId = slotsGuard.start()
    try {
      const headers = await authed()
      const { data } = await axios.get("/appointments/slots/all", { headers })
      if (slotsGuard.stale(reqId)) return
      setSlots(data)
    } catch (err) {
      if (slotsGuard.stale(reqId)) return
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    } finally {
      if (!slotsGuard.stale(reqId)) setSlotsLoading(false)
    }
  }

  useEffect(() => {
    loadAppointments()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loadSlots is async and only touches state after its own await; the rule can't see through the indirection to confirm that.
    loadSlots()
  }, [])

  const createSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSlot.date || !newSlot.startTime || !newSlot.endTime) return
    try {
      const headers = await authed()
      await axios.post(
        "/appointments/slots",
        {
          date: new Date(newSlot.date).toISOString(),
          startTime: new Date(
            `${newSlot.date}T${newSlot.startTime}`,
          ).toISOString(),
          endTime: new Date(
            `${newSlot.date}T${newSlot.endTime}`,
          ).toISOString(),
        },
        { headers },
      )
      setNewSlot({ date: "", startTime: "", endTime: "" })
      loadSlots()
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  // <input type="time"> requires 24h "HH:MM" — not the localized fmtTime()
  // used for display elsewhere on this page.
  const to24hInput = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`
  }
  const startEditSlot = (s: SlotRow) => {
    setEditingSlotId(s.id)
    setSlotEditForm({
      date: s.date.slice(0, 10),
      startTime: to24hInput(s.startTime),
      endTime: to24hInput(s.endTime),
    })
  }
  const cancelEditSlot = () => {
    setEditingSlotId(null)
    setSlotEditForm({ date: "", startTime: "", endTime: "" })
  }
  const saveSlotEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSlotId) return
    try {
      const headers = await authed()
      await axios.patch(
        `/appointments/slots/${editingSlotId}`,
        {
          date: new Date(slotEditForm.date).toISOString(),
          startTime: new Date(
            `${slotEditForm.date}T${slotEditForm.startTime}`,
          ).toISOString(),
          endTime: new Date(
            `${slotEditForm.date}T${slotEditForm.endTime}`,
          ).toISOString(),
        },
        { headers },
      )
      cancelEditSlot()
      loadSlots()
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }
  const toggleSlotClosed = async (s: SlotRow) => {
    try {
      const headers = await authed()
      await axios.patch(
        `/appointments/slots/${s.id}`,
        { isClosed: !s.isClosed },
        { headers },
      )
      loadSlots()
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }
  const updateAppointmentStatus = async (
    id: string,
    status: "done" | "cancelled",
  ) => {
    try {
      const headers = await authed()
      await axios.patch(`/appointments/${id}/status`, { status }, { headers })
      loadAppointments(bookingQuery)
      loadSlots()
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  return (
    <>
      <form
        onSubmit={createSlot}
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #E6E5E0",
          padding: 20,
          marginBottom: 20,
          display: "flex",
          gap: 12,
          alignItems: "flex-end",
          flexWrap: "wrap",
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
            {t("bookings.date")}
          </label>
          <input
            type="date"
            value={newSlot.date}
            onChange={(e) =>
              setNewSlot((s) => ({ ...s, date: e.target.value }))
            }
            required
            style={{
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
            {t("bookings.startTime")}
          </label>
          <input
            type="time"
            value={newSlot.startTime}
            onChange={(e) =>
              setNewSlot((s) => ({ ...s, startTime: e.target.value }))
            }
            required
            style={{
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
            {t("bookings.endTime")}
          </label>
          <input
            type="time"
            value={newSlot.endTime}
            onChange={(e) =>
              setNewSlot((s) => ({ ...s, endTime: e.target.value }))
            }
            required
            style={{
              padding: "9px 12px",
              borderRadius: 10,
              border: "1.5px solid #E6E5E0",
              fontSize: 13,
              fontFamily: "Poppins, sans-serif",
            }}
          />
        </div>
        <button
          type="submit"
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
          {t("bookings.addSlot")}
        </button>
      </form>

      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: palette.navy,
          marginBottom: 12,
        }}
      >
        {t("bookings.slotsHeading")}
      </div>
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #E6E5E0",
          overflow: "hidden",
          marginBottom: 32,
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          {tableHead(t.raw("bookings.slotCols"))}
          {slotsLoading ? (
            <TableSkeletonRows cols={t.raw("bookings.slotCols").length} />
          ) : (
          <tbody>
            {slots.map((s, i) =>
              editingSlotId === s.id ? (
                <tr key={s.id} style={{ background: palette.accentLight }}>
                  <td colSpan={5} style={{ padding: "14px 16px" }}>
                    <form
                      onSubmit={saveSlotEdit}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <input
                        type="date"
                        value={slotEditForm.date}
                        onChange={(e) =>
                          setSlotEditForm((f) => ({
                            ...f,
                            date: e.target.value,
                          }))
                        }
                        required
                        style={{
                          padding: "7px 10px",
                          borderRadius: 8,
                          border: "1.5px solid #E6E5E0",
                          fontSize: 13,
                          fontFamily: "Poppins, sans-serif",
                        }}
                      />
                      <input
                        type="time"
                        value={slotEditForm.startTime}
                        onChange={(e) =>
                          setSlotEditForm((f) => ({
                            ...f,
                            startTime: e.target.value,
                          }))
                        }
                        required
                        style={{
                          padding: "7px 10px",
                          borderRadius: 8,
                          border: "1.5px solid #E6E5E0",
                          fontSize: 13,
                          fontFamily: "Poppins, sans-serif",
                        }}
                      />
                      <input
                        type="time"
                        value={slotEditForm.endTime}
                        onChange={(e) =>
                          setSlotEditForm((f) => ({
                            ...f,
                            endTime: e.target.value,
                          }))
                        }
                        required
                        style={{
                          padding: "7px 10px",
                          borderRadius: 8,
                          border: "1.5px solid #E6E5E0",
                          fontSize: 13,
                          fontFamily: "Poppins, sans-serif",
                        }}
                      />
                      <button
                        type="submit"
                        style={{
                          padding: "7px 16px",
                          borderRadius: 9999,
                          border: "none",
                          background: palette.accent,
                          color: palette.navy,
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: "pointer",
                          fontFamily: "Poppins, sans-serif",
                        }}
                      >
                        {t("bookings.save")}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditSlot}
                        style={{
                          padding: "7px 16px",
                          borderRadius: 9999,
                          border: "1.5px solid #E6E5E0",
                          background: "#fff",
                          color: palette.slate,
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: "pointer",
                          fontFamily: "Poppins, sans-serif",
                        }}
                      >
                        {t("bookings.cancelEdit")}
                      </button>
                    </form>
                  </td>
                </tr>
              ) : (
                <tr
                  key={s.id}
                  style={{
                    background: i % 2 === 0 ? "#fff" : "#FAFAFA",
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
                    {fmtDate(s.date)}
                  </td>
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: 13,
                      color: palette.slate,
                    }}
                  >
                    {fmtTime(s.startTime)}–{fmtTime(s.endTime)}
                  </td>
                  <td
                    style={{
                      padding: "14px 16px",
                      fontSize: 13,
                      color: palette.slate,
                    }}
                  >
                    {s.appointment
                      ? `${s.appointment.client.firstName} ${s.appointment.client.lastName}`
                      : "—"}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <StatusBadge
                      status={
                        s.isClosed
                          ? "closed"
                          : s.isBooked
                            ? "booked"
                            : "open"
                      }
                    />
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => startEditSlot(s)}
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
                        {t("bookings.edit")}
                      </button>
                      <button
                        onClick={() => toggleSlotClosed(s)}
                        style={{
                          background: s.isClosed
                            ? "#DCFCE7"
                            : "#FEE2E2",
                          color: s.isClosed ? "#166534" : "#991B1B",
                          border: "none",
                          borderRadius: 9999,
                          padding: "5px 14px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "Poppins, sans-serif",
                        }}
                      >
                        {s.isClosed
                          ? t("bookings.reopenSlot")
                          : t("bookings.closeSlot")}
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
            {slots.length === 0 && (
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
                  {t("bookings.noSlots")}
                </td>
              </tr>
            )}
          </tbody>
          )}
        </table>
      </div>

      <SearchBox
        value={bookingQuery}
        onChange={setBookingQuery}
        onSearch={() => loadAppointments(bookingQuery)}
        placeholder={t("bookings.searchPlaceholder")}
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
          {tableHead(t.raw("bookings.cols"))}
          {appointmentsList.initialLoading ? (
            <TableSkeletonRows cols={t.raw("bookings.cols").length} />
          ) : (
          <tbody>
            {appointmentsList.items.map((b, i) => (
              <tr
                key={b.id}
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
                  {b.client.firstName} {b.client.lastName}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 13,
                    color: palette.slate,
                  }}
                >
                  {b.client.companyName ?? "—"}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 13,
                    color: palette.navy,
                  }}
                >
                  {fmtDate(b.slot.date)}
                </td>
                <td
                  style={{
                    padding: "14px 16px",
                    fontSize: 13,
                    color: palette.slate,
                  }}
                >
                  {fmtTime(b.slot.startTime)}–{fmtTime(b.slot.endTime)}
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <StatusBadge status={b.status} />
                </td>
                <td style={{ padding: "14px 16px" }}>
                  {b.status === AppointmentStatus.Booked ? (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() =>
                          updateAppointmentStatus(b.id, "done")
                        }
                        style={{
                          background: "#166534",
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
                        {t("bookings.markDone")}
                      </button>
                      <button
                        onClick={() =>
                          updateAppointmentStatus(b.id, "cancelled")
                        }
                        style={{
                          background: "#991B1B",
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
                        {t("bookings.cancelBooking")}
                      </button>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {appointmentsList.items.length === 0 && (
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
                  {t("bookings.none")}
                </td>
              </tr>
            )}
          </tbody>
          )}
        </table>
        <LoadMoreButton
          hasMore={appointmentsList.hasMore}
          loading={appointmentsList.loadingMore}
          onClick={loadMoreAppointments}
        />
      </div>
    </>
  )
}
