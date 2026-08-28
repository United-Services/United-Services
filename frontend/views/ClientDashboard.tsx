"use client"
 
/* Sidebar */ /* Main */ /* ── SERVICES ── */ /* ── RFQ ── */ /* ── APPOINTMENTS ── */ /* ── PROFILE ── */
import { useEffect, useState } from "react"
import Image from "next/image"
import { io } from "socket.io-client"
import { useAuth } from "@clerk/nextjs"
import { useLocale, useTranslations } from "next-intl"
import { palette, inputStyle } from "../theme"
import { InlineSpinner } from "../components/Spinner"
import { Skeleton, SkeletonCards, SkeletonRows } from "../components/Skeleton"
import { warmImageCache } from "../lib/specsPrefetch"
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

interface Props {
  onLogout: () => void
  onNavigate: (page: string) => void
}

interface Service {
  id: string
  slug: string
  name: string
  shortDescription: string
  imageUrl: string | null
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
  const locale = useLocale()
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
  // Per-image load state for the skeleton overlay below — an <img> that's
  // still downloading shows a skeleton in its place instead of a
  // partially-decoded/streaming-in image, which reads as broken rather
  // than "loading." Mirrors AdminSpecsSection.tsx's same pattern.
  const [imageReady, setImageReady] = useState<Record<string, boolean>>({})

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
  const [pageLoading, setPageLoading] = useState(true)

  const authed = async () => authHeader(await getToken())

  const loadAll = async () => {
    try {
      const headers = await authed()
      const [meRes, servicesRes, requestsRes, slotsRes, myApptsRes] =
        await Promise.all([
          axios.get("/me", { headers }),
          axios.get("/services", {
            headers,
            params: locale !== "en" ? { locale } : undefined,
          }),
          axios.get("/file-access-requests/mine", { headers }),
          axios.get("/appointments/slots", { headers }),
          axios.get("/appointments/mine", { headers }),
        ])
      setMe(meRes.data)
      setServices(servicesRes.data)
      // Kick off image downloads as soon as the list arrives rather than
      // waiting for each <img loading="lazy"> to scroll into view — by the
      // time the services grid actually paints below, most/all images are
      // already warm in the browser's HTTP cache.
      warmImageCache(servicesRes.data)
      setMyRequests(requestsRes.data)
      setSlots(slotsRes.data)
      setMyAppointments(myApptsRes.data)

      const serviceIds = servicesRes.data.map((s: Service) => s.id)
      if (serviceIds.length > 0) {
        const { data } = await axios.get("/services/latest-files", {
          headers,
          params: { ids: serviceIds.join(",") },
        })
        setLatestFiles(data)
      } else {
        setLatestFiles({})
      }
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    } finally {
      setPageLoading(false)
    }
  }

  useEffect(() => {
    // Standard fetch-on-mount (react.dev/learn/you-might-not-need-an-effect
    // explicitly endorses this shape) — loadAll only touches state after
    // its own await, so nothing here sets state synchronously during this
    // effect's own execution. Re-runs on locale change too, so switching
    // language re-fetches services with their machine-translated content.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
  }, [locale])

  const refetchSlots = async () => {
    const headers = await authed()
    const { data } = await axios.get("/appointments/slots", { headers })
    setSlots(data)
  }

  // Live updates for the open-slots picker — AppointmentsGateway
  // broadcasts "slots:changed" whenever any slot's availability changes
  // (booked, closed, or a new one added), so another client sees a taken
  // slot disappear from the dropdown without waiting for their next visit
  // or a failed booking attempt. Double-booking itself is still prevented
  // by the backend's DB transaction regardless of this — this socket is
  // purely a UX signal to refetch, not a source of truth.
  useEffect(() => {
    const socket = io("/appointments")
    socket.on("slots:changed", () => {
      refetchSlots().catch(() => {
        // Best-effort — the next real fetch (page load, or the
        // bookAppointment catch block) still keeps the list correct.
      })
    })
    return () => {
      socket.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await refetchSlots()
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
          background: "#F3F2EE",
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
            <Image
              src="/images/logo-footer.webp"
              alt="United Services Egypt"
              width={89}
              height={64}
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
                color: section === n.id ? palette.accent : "#8C8C88",
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
                color: palette.navy,
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
                  <Skeleton height={11} width={90} style={{ background: "rgba(255,255,255,0.25)" }} />
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
            borderBottom: "1px solid #E6E5E0",
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
          {pageLoading && (
            <div>
              {section === "appointments" ? (
                <SkeletonRows count={5} withAvatar={false} />
              ) : (
                <SkeletonCards count={3} />
              )}
            </div>
          )}
          {!pageLoading && section === "services" && (
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
                        border: "1px solid #E6E5E0",
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
                      {s.imageUrl ? (
                        <div
                          style={{
                            position: "relative",
                            width: "100%",
                            height: 140,
                          }}
                        >
                          {/* Shown until the image below fires onLoad — see
                              imageReady state above. Usually invisible in
                              practice: loadAll() already warmed the
                              browser's cache for this exact URL via
                              warmImageCache() before this grid painted. */}
                          {!imageReady[s.id] && (
                            <div style={{ position: "absolute", inset: 0 }}>
                              <Skeleton height="100%" radius={0} />
                            </div>
                          )}
                          {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded S3 presigned URL, not a static build-time asset next/image can optimize */}
                          <img
                            src={s.imageUrl}
                            alt={s.name}
                            loading="lazy"
                            onLoad={() =>
                              setImageReady((prev) => ({ ...prev, [s.id]: true }))
                            }
                            onError={() =>
                              setImageReady((prev) => ({ ...prev, [s.id]: true }))
                            }
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                              opacity: imageReady[s.id] ? 1 : 0,
                              transition: "opacity 0.15s ease",
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{ width: "100%", height: 140, background: "#F3F2EE" }} />
                      )}
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
                              background: "#F3F2EE",
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
                              color: palette.navy,
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
          {!pageLoading && section === "rfq" && (
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
                    border: "1px solid #E6E5E0",
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
                          "#E6E5E0"
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
                          "#E6E5E0"
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
                        e.target.style.borderColor = "#E6E5E0"
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
                          "#E6E5E0"
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
                      color: rfqLoading ? "#fff" : palette.navy,
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
          {!pageLoading && section === "appointments" && (
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
                    border: "1px solid #E6E5E0",
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
                        background: "#F3F2EE",
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
                            "#E6E5E0"
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
                  border: "1px solid #E6E5E0",
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
                      color: palette.navy,
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
                        <Skeleton height={13} width={110} />
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
                        borderBottom: "1px solid #F3F2EE",
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
