"use client"
// eslint-disable-next-line react-hooks/exhaustive-deps
/* Sidebar */ /* Main */ /* ── SERVICES ── */ /* ── RFQ ── */ /* ── APPOINTMENTS ── */ /* ── PROFILE ── */
import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette, inputStyle } from "../theme"
import { InlineSpinner } from "../components/Spinner"
import {
  IconGear,
  IconClipboard,
  IconCalendar,
  IconUser,
  IconLogout,
} from "../components/NavIcons"
import { axios, authHeader } from "../lib/api"
import { FileAccessStatus } from "../enums/status.enums"
import ErrorBanner from "../components/ErrorBanner"
import { getErrorMessage } from "../lib/errors"
import PublicNav from "../components/PublicNav"

const FALLBACK_IMG = "/images/bp-valves.jpg"
const SVC_IMG_BY_SLUG: Record<string, string> = {
  "gre-tubular-lining": "/images/bp-valves.jpg",
  "external-wrapping":
    "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=600&q=80",
  "industrial-coating":
    "https://images.unsplash.com/photo-1678984239420-43cdc183bce6?w=600&q=80",
  "hdpe-lining":
    "https://images.unsplash.com/photo-1684667273934-e5d39307eeae?w=600&q=80",
  "rtp-systems":
    "https://images.unsplash.com/photo-1758965364875-e090e5423d2d?w=600&q=80",
  "rtv-insulator-coating": "/images/lux-power.jpg",
}

interface Props {
  onLogout: () => void
  onNavigate: (page: string) => void
}

interface Service {
  id: string
  slug: string
  name: string
  shortDescription: string
}
type LatestFile = { id: string; originalFilename: string } | null
interface FileAccessRequest {
  id: string
  status: FileAccessStatus
  serviceFile: { id: string; service: { name: string; slug: string } }
}
interface Slot {
  id: string
  date: string
  startTime: string
  endTime: string
}
interface MyAppointment {
  id: string
  slot: Slot
}
interface Me {
  firstName: string
  lastName: string
  email: string
  companyName: string | null
  role: string
}

export default function ClientDashboard({ onLogout, onNavigate }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("clientDashboard")
  const tCommon = useTranslations("common")
  const [section, setSection] = useState("services")
  const [error, setError] = useState<string | null>(null)

  const NAV_ITEMS = [
    { id: "services", label: t("nav.services"), icon: <IconGear /> },
    { id: "rfq", label: t("nav.rfq"), icon: <IconClipboard /> },
    {
      id: "appointments",
      label: t("nav.appointments"),
      icon: <IconCalendar />,
    },
    { id: "profile", label: t("nav.profile"), icon: <IconUser /> },
  ]

  const [me, setMe] = useState<Me | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [latestFiles, setLatestFiles] = useState<Record<string, LatestFile>>({})
  const [myRequests, setMyRequests] = useState<FileAccessRequest[]>([])
  const [requestingId, setRequestingId] = useState<string | null>(null)

  const [rfq, setRfq] = useState({
    serviceId: "",
    description: "",
    timeline: "",
    message: "",
  })
  const [rfqSent, setRfqSent] = useState(false)
  const [rfqLoading, setRfqLoading] = useState(false)

  const [slots, setSlots] = useState<Slot[]>([])
  const [myAppointments, setMyAppointments] = useState<MyAppointment[]>([])
  const [selectedSlotId, setSelectedSlotId] = useState("")
  const [apptSent, setApptSent] = useState(false)
  const [apptLoading, setApptLoading] = useState(false)
  const [apptError, setApptError] = useState<string | null>(null)

  const authed = async () => authHeader(await getToken())

  const loadAll = async () => {
    try {
      const headers = await authed()
      const [meRes, servicesRes, requestsRes, slotsRes, myApptsRes] =
        await Promise.all([
          axios.get("/me", { headers }),
          axios.get("/services", { headers }),
          axios.get("/file-access-requests/mine", { headers }),
          axios.get("/appointments/slots", { headers }),
          axios.get("/appointments/mine", { headers }),
        ])
      setMe(meRes.data)
      setServices(servicesRes.data)
      setMyRequests(requestsRes.data)
      setSlots(slotsRes.data)
      setMyAppointments(myApptsRes.data)

      const filePairs = await Promise.all(
        servicesRes.data.map(async (s: Service) => {
          const { data } = await axios.get(`/services/${s.id}/latest-file`, {
            headers,
          })
          return [s.id, data] as const
        }),
      )
      setLatestFiles(Object.fromEntries(filePairs))
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    }
  }

  useEffect(() => {
    // Standard fetch-on-mount (react.dev/learn/you-might-not-need-an-effect
    // explicitly endorses this shape) — loadAll only touches state after
    // its own await, so nothing here sets state synchronously during this
    // effect's own execution.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [])

  const statusForService = (
    serviceId: string,
  ): "none" | FileAccessStatus => {
    const file = latestFiles[serviceId]
    if (!file) return "none"
    const req = myRequests.find((r) => r.serviceFile.id === file.id)
    return req?.status ?? "none"
  }

  const requestSpec = async (serviceId: string) => {
    const file = latestFiles[serviceId]
    if (!file) return
    setRequestingId(serviceId)
    try {
      const headers = await authed()
      await axios.post("/file-access-requests", { serviceFileId: file.id }, {
        headers,
      })
      const { data } = await axios.get("/file-access-requests/mine", { headers })
      setMyRequests(data)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setRequestingId(null)
    }
  }

  const downloadSpec = async (serviceId: string) => {
    const file = latestFiles[serviceId]
    const req = myRequests.find((r) => r.serviceFile.id === file?.id)
    if (!req) return
    try {
      const headers = await authed()
      const { data } = await axios.get(`/file-access-requests/${req.id}/download`, {
        headers,
      })
      window.open(data.url, "_blank")
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  const submitRfq = async (e: React.FormEvent) => {
    e.preventDefault()
    setRfqLoading(true)
    try {
      const headers = await authed()
      const projectDetails = [
        rfq.description,
        rfq.timeline && `Timeline: ${rfq.timeline}`,
        rfq.message,
      ]
        .filter(Boolean)
        .join("\n\n")
      await axios.post(
        "/rfqs",
        { serviceId: rfq.serviceId || undefined, projectDetails },
        { headers },
      )
      setRfqSent(true)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setRfqLoading(false)
    }
  }

  const bookAppointment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSlotId) return
    setApptLoading(true)
    setApptError(null)
    try {
      const headers = await authed()
      await axios.post("/appointments/book", { slotId: selectedSlotId }, {
        headers,
      })
      setApptSent(true)
    } catch (err: any) {
      setApptError(
        err?.response?.data?.message ?? t("appointments.slotTakenError"),
      )
      const headers = await authed()
      const { data } = await axios.get("/appointments/slots", { headers })
      setSlots(data)
    } finally {
      setApptLoading(false)
    }
  }

  return (
    <div style={{ fontFamily: "Poppins, sans-serif" }}>
      <PublicNav current="client-dashboard" onNavigate={onNavigate} />
      <div
        style={{
          display: "flex",
          marginTop: 68,
          height: "calc(100vh - 68px)",
          overflow: "hidden",
          background: "#F8FAFC",
        }}
      >
      {}
      <aside
        className="dashboard-sidebar"
        style={{
          width: 240,
          flexShrink: 0,
          background: palette.navy,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            height: 68,
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            borderBottom: "1px solid #1E293B",
          }}
        >
          <button
            onClick={() => onNavigate("home")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <img
              src="/images/logo-footer.png"
              alt="United Services Egypt"
              style={{ height: 28, width: "auto", objectFit: "contain" }}
            />
            <div className="sidebar-label">
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
                {t("portalLabel")}
              </div>
              <div style={{ fontSize: 10, color: "#475569" }}>
                United Services Egypt
              </div>
            </div>
          </button>
        </div>
        <nav
          style={{
            flex: 1,
            padding: "16px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {NAV_ITEMS.map((n) => (
            <button
              key={n.id}
              className="sidebar-nav-btn"
              onClick={() => setSection(n.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background:
                  section === n.id ? "rgba(234,88,12,0.15)" : "transparent",
                color: section === n.id ? palette.accent : "#64748B",
                fontWeight: section === n.id ? 600 : 400,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
                textAlign: "left",
                transition: "background 0.15s",
              }}
            >
              {n.icon}
              <span className="sidebar-label">{n.label}</span>
            </button>
          ))}
        </nav>
        <div style={{ padding: "12px 10px", borderTop: "1px solid #1E293B" }}>
          <div
            className="sidebar-label"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              marginBottom: 4,
              background: "#1E293B",
              borderRadius: 10,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: palette.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                flexShrink: 0,
              }}
            >
              {me?.firstName?.[0] ?? "·"}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {me ? (
                  `${me.firstName} ${me.lastName}`
                ) : (
                  <InlineSpinner size={12} />
                )}
              </div>
              <div style={{ fontSize: 11, color: "#475569" }}>
                {me?.companyName ?? ""}
              </div>
            </div>
          </div>
          <button
            className="sidebar-nav-btn"
            onClick={onLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 14px",
              borderRadius: 10,
              border: "none",
              background: "transparent",
              color: "#EF4444",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              width: "100%",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            <IconLogout size={15} />
            <span className="sidebar-label">{t("logOut")}</span>
          </button>
        </div>
      </aside>

      {}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            height: 68,
            background: "#fff",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            alignItems: "center",
            padding: "0 32px",
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 700, color: palette.navy }}>
            {NAV_ITEMS.find((n) => n.id === section)?.label ??
              t("headerFallback")}
          </h1>
        </header>

        <main style={{ flex: 1, overflowY: "auto", padding: "32px" }}>
          <ErrorBanner
            message={error}
            onDismiss={() => setError(null)}
            dismissLabel={tCommon("errors.dismiss")}
          />
          {}
          {section === "services" && (
            <div>
              <p
                style={{ fontSize: 14, color: palette.muted, marginBottom: 28 }}
              >
                {t("services.intro")}
              </p>
              <div
                className="responsive-card-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 20,
                }}
              >
                {services.map((s) => {
                  const status = statusForService(s.id)
                  const hasFile = !!latestFiles[s.id]
                  return (
                    <div
                      key={s.id}
                      style={{
                        background: "#fff",
                        borderRadius: 18,
                        border: "1px solid #E2E8F0",
                        overflow: "hidden",
                        transition: "box-shadow 0.2s",
                      }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLDivElement).style.boxShadow =
                          "0 8px 32px rgba(0,0,0,0.07)"
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLDivElement).style.boxShadow =
                          "none"
                      }}
                    >
                      <img
                        src={SVC_IMG_BY_SLUG[s.slug] ?? FALLBACK_IMG}
                        alt={s.name}
                        style={{
                          width: "100%",
                          height: 140,
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                      <div style={{ padding: "18px 18px" }}>
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: palette.navy,
                            marginBottom: 6,
                          }}
                        >
                          {s.name}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: palette.muted,
                            marginBottom: 14,
                          }}
                        >
                          {s.shortDescription}
                        </div>
                        {!hasFile && (
                          <div
                            style={{
                              textAlign: "center",
                              fontSize: 12,
                              color: palette.muted,
                              fontWeight: 600,
                              padding: "9px",
                              background: "#F8FAFC",
                              borderRadius: 9999,
                            }}
                          >
                            {t("services.noFile")}
                          </div>
                        )}
                        {hasFile && status === "none" && (
                          <button
                            onClick={() => requestSpec(s.id)}
                            disabled={requestingId === s.id}
                            style={{
                              width: "100%",
                              padding: "9px",
                              background: "#4B5563",
                              color: "#fff",
                              border: "none",
                              borderRadius: 9999,
                              fontWeight: 600,
                              fontSize: 13,
                              cursor: "pointer",
                              fontFamily: "Poppins, sans-serif",
                            }}
                          >
                            {requestingId === s.id ? (
                              <>
                                <InlineSpinner size={13} />{" "}
                                {t("services.requesting")}
                              </>
                            ) : (
                              t("services.requestSpecFile")
                            )}
                          </button>
                        )}
                        {hasFile && status === FileAccessStatus.Pending && (
                          <div
                            style={{
                              textAlign: "center",
                              fontSize: 12,
                              color: "#F59E0B",
                              fontWeight: 600,
                              padding: "9px",
                              background: "#FFFBEB",
                              borderRadius: 9999,
                              border: "1px solid #FCD34D",
                            }}
                          >
                            {t("services.awaitingApproval")}
                          </div>
                        )}
                        {hasFile && status === FileAccessStatus.Denied && (
                          <div
                            style={{
                              textAlign: "center",
                              fontSize: 12,
                              color: "#DC2626",
                              fontWeight: 600,
                              padding: "9px",
                              background: "#FEF2F2",
                              borderRadius: 9999,
                              border: "1px solid #FECACA",
                            }}
                          >
                            {t("services.requestDenied")}
                          </div>
                        )}
                        {hasFile && status === FileAccessStatus.Approved && (
                          <button
                            onClick={() => downloadSpec(s.id)}
                            style={{
                              width: "100%",
                              padding: "9px",
                              background: palette.accent,
                              color: "#fff",
                              border: "none",
                              borderRadius: 9999,
                              fontWeight: 700,
                              fontSize: 13,
                              cursor: "pointer",
                              fontFamily: "Poppins, sans-serif",
                            }}
                          >
                            {t("services.downloadSpecFile")}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {}
          {section === "rfq" && (
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
              {rfqSent ? (
                <div
                  style={{
                    background: "#F0FDF4",
                    border: "1px solid #BBF7D0",
                    borderRadius: 20,
                    padding: "48px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                  <h2
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: "#166534",
                      marginBottom: 10,
                    }}
                  >
                    {t("rfq.sentTitle")}
                  </h2>
                  <p
                    style={{ fontSize: 14, color: "#15803D", lineHeight: 1.7 }}
                  >
                    {t("rfq.sentBody")}
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={submitRfq}
                  style={{
                    background: "#fff",
                    borderRadius: 20,
                    padding: "36px",
                    border: "1px solid #E2E8F0",
                  }}
                >
                  <div style={{ marginBottom: 18 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 600,
                        color: palette.navy,
                        marginBottom: 8,
                      }}
                    >
                      {t("rfq.serviceRequired")}
                    </label>
                    <select
                      value={rfq.serviceId}
                      onChange={(e) =>
                        setRfq((f) => ({ ...f, serviceId: e.target.value }))
                      }
                      required
                      style={{ ...inputStyle, appearance: "none" }}
                      onFocus={(e) => {
                        ;(e.target as HTMLSelectElement).style.borderColor =
                          palette.accent
                      }}
                      onBlur={(e) => {
                        ;(e.target as HTMLSelectElement).style.borderColor =
                          "#E2E8F0"
                      }}
                    >
                      <option value="">{t("rfq.selectService")}</option>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 600,
                        color: palette.navy,
                        marginBottom: 8,
                      }}
                    >
                      {t("rfq.projectDescription")}
                    </label>
                    <textarea
                      value={rfq.description}
                      onChange={(e) =>
                        setRfq((f) => ({ ...f, description: e.target.value }))
                      }
                      placeholder={t("rfq.projectDescriptionPlaceholder")}
                      required
                      rows={4}
                      style={{ ...inputStyle, resize: "vertical" }}
                      onFocus={(e) => {
                        ;(e.target as HTMLTextAreaElement).style.borderColor =
                          palette.accent
                      }}
                      onBlur={(e) => {
                        ;(e.target as HTMLTextAreaElement).style.borderColor =
                          "#E2E8F0"
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 600,
                        color: palette.navy,
                        marginBottom: 8,
                      }}
                    >
                      {t("rfq.requiredTimeline")}
                    </label>
                    <input
                      value={rfq.timeline}
                      onChange={(e) =>
                        setRfq((f) => ({ ...f, timeline: e.target.value }))
                      }
                      placeholder={t("rfq.timelinePlaceholder")}
                      style={inputStyle}
                      onFocus={(e) => {
                        e.target.style.borderColor = palette.accent
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = "#E2E8F0"
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: 28 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 600,
                        color: palette.navy,
                        marginBottom: 8,
                      }}
                    >
                      {t("rfq.additionalNotes")}
                    </label>
                    <textarea
                      value={rfq.message}
                      onChange={(e) =>
                        setRfq((f) => ({ ...f, message: e.target.value }))
                      }
                      placeholder={t("rfq.notesPlaceholder")}
                      rows={3}
                      style={{ ...inputStyle, resize: "vertical" }}
                      onFocus={(e) => {
                        ;(e.target as HTMLTextAreaElement).style.borderColor =
                          palette.accent
                      }}
                      onBlur={(e) => {
                        ;(e.target as HTMLTextAreaElement).style.borderColor =
                          "#E2E8F0"
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={rfqLoading}
                    style={{
                      width: "100%",
                      padding: "13px",
                      borderRadius: 9999,
                      border: "none",
                      background: rfqLoading ? "#9CA3AF" : palette.accent,
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: "pointer",
                      fontFamily: "Poppins, sans-serif",
                    }}
                  >
                    {rfqLoading ? (
                      <>
                        <InlineSpinner size={14} /> {t("rfq.submitting")}
                      </>
                    ) : (
                      t("rfq.submit")
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {}
          {section === "appointments" && (
            <div style={{ maxWidth: 540, margin: "0 auto" }}>
              {apptSent ? (
                <div
                  style={{
                    background: "#F0FDF4",
                    border: "1px solid #BBF7D0",
                    borderRadius: 20,
                    padding: "48px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
                  <h2
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: "#166534",
                      marginBottom: 10,
                    }}
                  >
                    {t("appointments.sentTitle")}
                  </h2>
                  <p
                    style={{ fontSize: 14, color: "#15803D", lineHeight: 1.7 }}
                  >
                    {t("appointments.sentBody")}
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={bookAppointment}
                  style={{
                    background: "#fff",
                    borderRadius: 20,
                    padding: "36px",
                    border: "1px solid #E2E8F0",
                  }}
                >
                  <p
                    style={{
                      fontSize: 14,
                      color: palette.muted,
                      marginBottom: 28,
                    }}
                  >
                    {t("appointments.intro")}
                  </p>

                  {myAppointments.length > 0 && (
                    <div
                      style={{
                        marginBottom: 24,
                        padding: "14px 16px",
                        background: "#F8FAFC",
                        borderRadius: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: palette.navy,
                          marginBottom: 8,
                        }}
                      >
                        {t("appointments.upcoming")}
                      </div>
                      {myAppointments.map((a) => (
                        <div
                          key={a.id}
                          style={{ fontSize: 13, color: palette.slate }}
                        >
                          {new Date(a.slot.date).toLocaleDateString()} ·{" "}
                          {new Date(a.slot.startTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                          –
                          {new Date(a.slot.endTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          })}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ marginBottom: 18 }}>
                    <label
                      style={{
                        display: "block",
                        fontSize: 13,
                        fontWeight: 600,
                        color: palette.navy,
                        marginBottom: 8,
                      }}
                    >
                      {t("appointments.availableSlots")}
                    </label>
                    {slots.length === 0 ? (
                      <p style={{ fontSize: 13, color: palette.muted }}>
                        {t("appointments.noSlots")}
                      </p>
                    ) : (
                      <select
                        value={selectedSlotId}
                        onChange={(e) => setSelectedSlotId(e.target.value)}
                        required
                        style={{ ...inputStyle, appearance: "none" }}
                        onFocus={(e) => {
                          ;(e.target as HTMLSelectElement).style.borderColor =
                            palette.accent
                        }}
                        onBlur={(e) => {
                          ;(e.target as HTMLSelectElement).style.borderColor =
                            "#E2E8F0"
                        }}
                      >
                        <option value="">{t("appointments.selectSlot")}</option>
                        {slots.map((s) => (
                          <option key={s.id} value={s.id}>
                            {new Date(s.date).toLocaleDateString()} ·{" "}
                            {new Date(s.startTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            })}
                            –
                            {new Date(s.endTime).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: true,
                            })}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {apptError && (
                    <p
                      style={{
                        fontSize: 13,
                        color: "#DC2626",
                        marginBottom: 16,
                      }}
                    >
                      {apptError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={apptLoading || !selectedSlotId}
                    style={{
                      width: "100%",
                      padding: "13px",
                      borderRadius: 9999,
                      border: "none",
                      background: apptLoading ? "#9CA3AF" : "#4B5563",
                      color: "#fff",
                      fontWeight: 700,
                      fontSize: 15,
                      cursor: "pointer",
                      fontFamily: "Poppins, sans-serif",
                    }}
                  >
                    {apptLoading ? (
                      <>
                        <InlineSpinner size={14} /> {t("appointments.booking")}
                      </>
                    ) : (
                      t("appointments.book")
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {}
          {section === "profile" && (
            <div style={{ maxWidth: 480, margin: "0 auto" }}>
              <div
                style={{
                  background: "#fff",
                  borderRadius: 20,
                  padding: "32px",
                  border: "1px solid #E2E8F0",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    marginBottom: 28,
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: "50%",
                      background: palette.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 20,
                    }}
                  >
                    {me?.firstName?.[0] ?? "·"}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: palette.navy,
                      }}
                    >
                      {me ? (
                        `${me.firstName} ${me.lastName}`
                      ) : (
                        <InlineSpinner size={12} />
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: palette.muted }}>
                      {me?.companyName ?? ""}
                    </div>
                  </div>
                </div>
                {me &&
                  [
                    [t("profile.email"), me.email],
                    [t("profile.company"), me.companyName ?? "—"],
                    [t("profile.accountType"), t("profile.client")],
                  ].map(([k, v]) => (
                    <div
                      key={k}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "14px 0",
                        borderBottom: "1px solid #F1F5F9",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: palette.muted,
                          fontWeight: 500,
                        }}
                      >
                        {k}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          color: palette.navy,
                          fontWeight: 600,
                        }}
                      >
                        {v}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </main>
      </div>
      </div>
    </div>
  )
}
