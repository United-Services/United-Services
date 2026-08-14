"use client"

// Overview

// Clients

// Specs

// Requests

// Positions

// Candidates

// RFQs

// Bookings

// Audit log
// eslint-disable-next-line react-hooks/exhaustive-deps
/* Sidebar */ /* Main */ /* OVERVIEW */ /* CLIENTS */ /* SPEC FILES */ /* FILE REQUESTS */ /* POSITIONS */ /* CANDIDATES */ /* RFQs */ /* BOOKINGS */ /* AUDIT LOG */ /* SECURITY */

import { useEffect, useRef, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { InlineSpinner } from "../components/Spinner"
import {
  IconChart,
  IconUsers,
  IconFolder,
  IconClipboard,
  IconCompass,
  IconCap,
  IconBriefcase,
  IconCalendar,
  IconReceipt,
  IconLock,
  IconLogout,
} from "../components/NavIcons"
import WorldMap from "../components/WorldMap"
import ErrorBanner from "../components/ErrorBanner"
import PublicNav from "../components/PublicNav"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { useRequestGuard } from "../lib/useRequestGuard"
import AdminSecuritySection from "./AdminSecuritySection"
import { FileAccessStatus, ApplicationStatus, Role } from "../enums/status.enums"

interface Props {
  onLogout: () => void
  onNavigate: (page: string) => void
}

interface Service {
  id: string
  slug: string
  name: string
}
interface ServiceFile {
  id: string
  originalFilename: string
  version: number
  uploadedAt: string
}
interface AdminUser {
  id: string
  firstName: string
  lastName: string
  email: string
  companyName: string | null
  role: string
  createdAt: string
  disabledAt: string | null
  mfaEnrolled: boolean
}
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
interface PositionRow {
  id: string
  title: string
  description: string
  department: string
  isOpen: boolean
  createdAt: string
}
interface CandidateRow {
  id: string
  status: ApplicationStatus
  dateOfBirth: string
  documentsRequested: boolean
  candidateUser: { firstName: string; lastName: string; email: string }
  position: { title: string; department: string } | null
}
interface RfqRow {
  id: string
  status: string
  createdAt: string
  projectDetails: string
  client: { firstName: string; lastName: string; companyName: string | null }
  service: { name: string } | null
}
interface AppointmentRow {
  id: string
  createdAt: string
  slot: { date: string; startTime: string; endTime: string }
  client: { firstName: string; lastName: string; companyName: string | null }
}
interface AuditLogRow {
  id: string
  action: string
  targetType: string
  targetId: string
  createdAt: string
  actor: { firstName: string; lastName: string; email: string; role: string }
}
interface Overview {
  clientCount: number
  companyCount: number
  fileAccessRequested: number
  fileAccessApproved: number
  rfqCount: number
  appointmentCount: number
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString()
const fmtDateTime = (d: string) => new Date(d).toLocaleString()
const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

// Hoisted to module scope (was defined inline in AdminDashboard's render
// body) — a component defined during render gets a new identity every
// render, which forces React to remount it instead of reconciling, so
// this input would lose focus on every keystroke-triggered re-render.
function SearchBox({
  value,
  onChange,
  onSearch,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onSearch: () => void
  placeholder: string
}) {
  const t = useTranslations("adminDashboard")
  return (
    <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSearch()
        }}
        placeholder={placeholder}
        style={{
          flex: 1,
          maxWidth: 320,
          padding: "9px 14px",
          borderRadius: 9999,
          border: "1.5px solid #E2E8F0",
          fontSize: 13,
          fontFamily: "Poppins, sans-serif",
          outline: "none",
        }}
      />
      <button
        onClick={onSearch}
        style={{
          padding: "9px 18px",
          borderRadius: 9999,
          border: "none",
          background: "#4B5563",
          color: "#fff",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "Poppins, sans-serif",
        }}
      >
        {t("search")}
      </button>
    </div>
  )
}

export default function AdminDashboard({ onLogout, onNavigate }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const [section, setSection] = useState("overview")
  // Every load/action function below sets this on failure instead of
  // letting a rejected axios promise propagate unhandled — previously a
  // 4xx/5xx/network error left whatever section triggered it silently
  // stuck (loading state never resolved, nothing told the admin anything
  // failed). One shared banner, cleared at the start of each new attempt.
  const [error, setError] = useState<string | null>(null)
  const authed = async () => authHeader(await getToken())

  // Each of these sections' load function is called both on mount and
  // again from a search box / post-action refresh — without a per-function
  // guard, a slow mount-time response can resolve after a faster later
  // one and overwrite fresher (e.g. searched) results with stale data.
  const overviewGuard = useRequestGuard()
  const clientsGuard = useRequestGuard()
  const requestsGuard = useRequestGuard()
  const positionsGuard = useRequestGuard()
  const candidatesGuard = useRequestGuard()
  const rfqsGuard = useRequestGuard()
  const appointmentsGuard = useRequestGuard()
  const auditLogGuard = useRequestGuard()

  const NAV = [
    { id: "overview", label: t("nav.overview"), icon: <IconChart /> },
    { id: "clients", label: t("nav.clients"), icon: <IconUsers /> },
    { id: "specs", label: t("nav.specs"), icon: <IconFolder /> },
    { id: "requests", label: t("nav.requests"), icon: <IconClipboard /> },
    { id: "positions", label: t("nav.positions"), icon: <IconCompass /> },
    { id: "candidates", label: t("nav.candidates"), icon: <IconCap /> },
    { id: "rfqs", label: t("nav.rfqs"), icon: <IconBriefcase /> },
    { id: "bookings", label: t("nav.bookings"), icon: <IconCalendar /> },
    { id: "audit", label: t("nav.audit"), icon: <IconReceipt /> },
    { id: "security", label: t("nav.security"), icon: <IconLock /> },
  ]
  const [overview, setOverview] = useState<Overview | null>(null)
  const [geoOverview, setGeoOverview] = useState<{
    country: string
    count: number
  }[]>([])
  const [clients, setClients] = useState<AdminUser[]>([])
  const [clientQuery, setClientQuery] = useState("")
  const [services, setServices] = useState<Service[]>([])
  const [serviceFiles, setServiceFiles] =
    useState<Record<string, ServiceFile[]>>({})
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [requests, setRequests] = useState<FileRequestRow[]>([])
  const [requestQuery, setRequestQuery] = useState("")
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
  const [candidates, setCandidates] = useState<CandidateRow[]>([])
  const [candidateQuery, setCandidateQuery] = useState("")
  const [rfqs, setRfqs] = useState<RfqRow[]>([])
  const [rfqQuery, setRfqQuery] = useState("")
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [bookingQuery, setBookingQuery] = useState("")
  const [newSlot, setNewSlot] = useState({
    date: "",
    startTime: "",
    endTime: "",
  })
  const [auditLog, setAuditLog] = useState<AuditLogRow[]>([])
  const [auditQuery, setAuditQuery] = useState("")

  const loadOverview = async () => {
    const reqId = overviewGuard.start()
    try {
      const headers = await authed()
      const { data } = await axios.get("/analytics/overview", { headers })
      if (overviewGuard.stale(reqId)) return
      setOverview(data)
    } catch (err) {
      if (overviewGuard.stale(reqId)) return
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    }
  }
  const loadGeoOverview = async () => {
    try {
      const headers = await authed()
      const { data } = await axios.get("/analytics/geo-overview", { headers })
      setGeoOverview(data.countries)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    }
  }
  const loadClients = async (q = "") => {
    const reqId = clientsGuard.start()
    try {
      const headers = await authed()
      const { data } = await axios.get("/admin/users", {
        headers,
        params: {
          role: Role.Client,
          q: q || undefined,
        },
      })
      if (clientsGuard.stale(reqId)) return
      setClients(data)
    } catch (err) {
      if (clientsGuard.stale(reqId)) return
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    }
  }
  const loadServices = async () => {
    try {
      const headers = await authed()
      const { data } = await axios.get("/services", { headers })
      setServices(data)
      const pairs = await Promise.all(
        data.map(async (s: Service) => {
          const res = await axios.get(`/services/${s.id}/files`, { headers })
          return [s.id, res.data] as const
        }),
      )
      setServiceFiles(Object.fromEntries(pairs))
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    }
  }
  const loadRequests = async (q = "") => {
    const reqId = requestsGuard.start()
    try {
      const headers = await authed()
      const { data } = await axios.get("/file-access-requests", {
        headers,
        params: {
          q: q || undefined,
        },
      })
      if (requestsGuard.stale(reqId)) return
      setRequests(data)
    } catch (err) {
      if (requestsGuard.stale(reqId)) return
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    }
  }
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
    }
  }
  const loadCandidates = async (q = "") => {
    const reqId = candidatesGuard.start()
    try {
      const headers = await authed()
      const { data } = await axios.get("/candidate-applications", {
        headers,
        params: {
          q: q || undefined,
        },
      })
      if (candidatesGuard.stale(reqId)) return
      setCandidates(data)
    } catch (err) {
      if (candidatesGuard.stale(reqId)) return
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    }
  }
  const loadRfqs = async (q = "") => {
    const reqId = rfqsGuard.start()
    try {
      const headers = await authed()
      const { data } = await axios.get("/rfqs", {
        headers,
        params: {
          q: q || undefined,
        },
      })
      if (rfqsGuard.stale(reqId)) return
      setRfqs(data)
    } catch (err) {
      if (rfqsGuard.stale(reqId)) return
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    }
  }
  const loadAppointments = async (q = "") => {
    const reqId = appointmentsGuard.start()
    try {
      const headers = await authed()
      const { data } = await axios.get("/appointments", {
        headers,
        params: {
          q: q || undefined,
        },
      })
      if (appointmentsGuard.stale(reqId)) return
      setAppointments(data)
    } catch (err) {
      if (appointmentsGuard.stale(reqId)) return
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    }
  }
  const loadAuditLog = async (q = "") => {
    const reqId = auditLogGuard.start()
    try {
      const headers = await authed()
      const { data } = await axios.get("/audit-log", {
        headers,
        params: {
          q: q || undefined,
        },
      })
      if (auditLogGuard.stale(reqId)) return
      setAuditLog(data)
    } catch (err) {
      if (auditLogGuard.stale(reqId)) return
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    }
  }

  useEffect(() => {
    // Standard fetch-on-mount (react.dev/learn/you-might-not-need-an-effect
    // explicitly endorses this shape): each load* function is async and
    // only touches state after its own await, so nothing here sets state
    // synchronously during this effect's own execution — the new
    // set-state-in-effect rule can't see through the indirection to confirm
    // that, so it flags the call by name regardless.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOverview()
    loadGeoOverview()
    loadClients()
    loadServices()
    loadRequests()
    loadPositions()
    loadCandidates()
    loadRfqs()
    loadAppointments()
    loadAuditLog()
  }, [])

  const toggleClientStatus = async (c: AdminUser) => {
    try {
      const headers = await authed()
      await axios.patch(
        `/admin/users/${c.id}/${c.disabledAt ? "enable" : "disable"}`,
        {},
        { headers },
      )
      loadClients(clientQuery)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  const uploadSpec = (serviceId: string) =>
    fileInputRefs.current[serviceId]?.click()

  const handleFileSelected = async (serviceId: string, file: File) => {
    setUploadingId(serviceId)
    try {
      const headers = await authed()
      const { data: presign } = await axios.post(
        `/services/${serviceId}/files/presign`,
        {
          filename: file.name,
          contentType: file.type || "application/octet-stream",
        },
        { headers },
      )
      await fetch(presign.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      })
      await axios.post(
        `/services/${serviceId}/files`,
        { s3Key: presign.key, originalFilename: file.name },
        { headers },
      )
      const { data: files } = await axios.get(`/services/${serviceId}/files`, {
        headers,
      })
      setServiceFiles((prev) => ({ ...prev, [serviceId]: files }))
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setUploadingId(null)
    }
  }

  const decideRequest = async (id: string, approve: boolean) => {
    try {
      const headers = await authed()
      await axios.post(`/file-access-requests/${id}/decide`, { approve }, {
        headers,
      })
      loadRequests(requestQuery)
      loadOverview()
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

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
      // lets them upload ID/CV after signup, not during it.
      if (data.idPhotoUrl) window.open(data.idPhotoUrl, "_blank")
      if (data.cvUrl) window.open(data.cvUrl, "_blank")
      if (!data.idPhotoUrl && !data.cvUrl) {
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
      loadAppointments(bookingQuery)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, { bg: string; color: string }> = {
      pending: { bg: "#FEF3C7", color: "#92400E" },
      approved: { bg: "#DCFCE7", color: "#166534" },
      open: { bg: "#DCFCE7", color: "#166534" },
      denied: { bg: "#FEE2E2", color: "#991B1B" },
      in_review: { bg: "#DBEAFE", color: "#1E40AF" },
      quoted: { bg: "#F3F4F6", color: "#374151" },
      closed: { bg: "#F1F5F9", color: "#475569" },
    }
    const s = map[status] ?? { bg: "#F1F5F9", color: "#475569" }
    const label = t.has(`status.${status}`)
      ? t(`status.${status}` as any)
      : status
    return (
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: "3px 10px",
          borderRadius: 9999,
          background: s.bg,
          color: s.color,
          textTransform: "capitalize",
        }}
      >
        {label}
      </span>
    )
  }

  const ActionPair = ({
    status,
    onApprove,
    onDeny,
  }: {
    status: string
    onApprove: () => void
    onDeny: () => void
  }) => {
    if (status !== "pending") return <StatusBadge status={status} />
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={onApprove}
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
          {t("approve")}
        </button>
        <button
          onClick={onDeny}
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
          {t("deny")}
        </button>
      </div>
    )
  }

  const tableHead = (cols: string[]) => (
    <thead>
      <tr>
        {cols.map((c) => (
          <th
            key={c}
            style={{
              padding: "10px 16px",
              fontSize: 11,
              fontWeight: 700,
              color: palette.muted,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              textAlign: "left",
              borderBottom: "1px solid #E2E8F0",
              background: "#F8FAFC",
            }}
          >
            {c}
          </th>
        ))}
      </tr>
    </thead>
  )

  return (
    <div style={{ fontFamily: "Poppins, sans-serif" }}>
      <PublicNav current="admin-dashboard" onNavigate={onNavigate} />
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
          width: 220,
          flexShrink: 0,
          background: palette.navy,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
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
              style={{ height: 26, width: "auto", objectFit: "contain" }}
            />
            <div className="sidebar-label">
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
                {t("panelLabel")}
              </div>
              <div style={{ fontSize: 9, color: "#475569" }}>
                United Services Egypt
              </div>
            </div>
          </button>
        </div>
        <nav
          style={{
            flex: 1,
            padding: "12px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            overflowY: "auto",
          }}
        >
          {NAV.map((n) => (
            <button
              key={n.id}
              className="sidebar-nav-btn"
              onClick={() => setSection(n.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 12px",
                borderRadius: 9,
                border: "none",
                background:
                  section === n.id ? "rgba(234,88,12,0.15)" : "transparent",
                color: section === n.id ? palette.accent : "#64748B",
                fontWeight: section === n.id ? 600 : 400,
                fontSize: 13,
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
        <div style={{ padding: "10px 8px", borderTop: "1px solid #1E293B" }}>
          <button
            className="sidebar-nav-btn"
            onClick={onLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderRadius: 9,
              border: "none",
              background: "transparent",
              color: "#EF4444",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              width: "100%",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            <IconLogout size={14} />
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
            height: 64,
            background: "#fff",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            alignItems: "center",
            padding: "0 32px",
          }}
        >
          <h1 style={{ fontSize: 17, fontWeight: 700, color: palette.navy }}>
            {NAV.find((n) => n.id === section)?.label ?? t("headerFallback")}
          </h1>
        </header>

        <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
          <ErrorBanner
            message={error}
            onDismiss={() => setError(null)}
            dismissLabel={tCommon("errors.dismiss")}
          />
          {}
          {section === "overview" && overview && (
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 16,
                  marginBottom: 32,
                }}
              >
                {[
                  {
                    label: t("overview.clients"),
                    value: overview.clientCount,
                    sub: t("overview.companiesSub", {
                      count: overview.companyCount,
                    }),
                  },
                  {
                    label: t("overview.fileRequests"),
                    value: overview.fileAccessRequested,
                    sub: t("overview.approvedSub", {
                      count: overview.fileAccessApproved,
                    }),
                  },
                  {
                    label: t("overview.rfqs"),
                    value: overview.rfqCount,
                    sub: t("overview.totalSubmitted"),
                  },
                  {
                    label: t("overview.appointments"),
                    value: overview.appointmentCount,
                    sub: t("overview.totalBooked"),
                  },
                ].map((c) => (
                  <div
                    key={c.label}
                    style={{
                      background: "#fff",
                      borderRadius: 16,
                      padding: "20px 22px",
                      border: "1px solid #E2E8F0",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: palette.muted,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        marginBottom: 8,
                      }}
                    >
                      {c.label}
                    </div>
                    <div
                      style={{
                        fontSize: 36,
                        fontWeight: 800,
                        color: palette.accent,
                        lineHeight: 1,
                        marginBottom: 6,
                      }}
                    >
                      {c.value}
                    </div>
                    <div style={{ fontSize: 12, color: palette.muted }}>
                      {c.sub}
                    </div>
                  </div>
                ))}
              </div>
              <div
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  padding: "24px",
                  border: "1px solid #E2E8F0",
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: palette.navy,
                    marginBottom: 4,
                  }}
                >
                  {t("overview.requestsByCountry")}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: palette.muted,
                    marginBottom: 16,
                  }}
                >
                  {t("overview.requestsByCountrySub")}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr",
                    gap: 24,
                    alignItems: "start",
                  }}
                  className="responsive-card-grid"
                >
                  <WorldMap
                    data={geoOverview}
                    noDataLabel={t("overview.noRequests")}
                    requestsLabel={t("overview.requests")}
                  />
                  <div>
                    {geoOverview.length === 0 && (
                      <div style={{ fontSize: 13, color: palette.muted }}>
                        {t("overview.noGeoData")}
                      </div>
                    )}
                    {geoOverview.slice(0, 8).map((row) => (
                      <div
                        key={row.country}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "8px 0",
                          borderBottom: "1px solid #F1F5F9",
                          fontSize: 13,
                        }}
                      >
                        <span style={{ color: palette.slate, fontWeight: 600 }}>
                          {row.country}
                        </span>
                        <span
                          style={{ color: palette.accent, fontWeight: 700 }}
                        >
                          {row.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  padding: "24px",
                  border: "1px solid #E2E8F0",
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: palette.navy,
                    marginBottom: 16,
                  }}
                >
                  {t("overview.recentActivity")}
                </div>
                {auditLog.slice(0, 6).map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "12px 0",
                      borderBottom: "1px solid #F1F5F9",
                    }}
                  >
                    <div
                      style={{ flex: 1, fontSize: 13, color: palette.slate }}
                    >
                      <strong>
                        {a.actor.firstName} {a.actor.lastName}
                      </strong>{" "}
                      — {a.action.replace(/_/g, " ").replace(/\./g, " ")}
                    </div>
                    <div style={{ fontSize: 12, color: palette.muted }}>
                      {fmtDateTime(a.createdAt)}
                    </div>
                  </div>
                ))}
                {auditLog.length === 0 && (
                  <div style={{ fontSize: 13, color: palette.muted }}>
                    {t("overview.noActivity")}
                  </div>
                )}
                <button
                  onClick={() => setSection("audit")}
                  style={{
                    marginTop: 12,
                    background: "none",
                    border: "none",
                    color: palette.accent,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "Poppins, sans-serif",
                  }}
                >
                  {t("overview.viewFullLog")}
                </button>
              </div>
            </div>
          )}

          {}
          {section === "clients" && (
            <>
              <SearchBox
                value={clientQuery}
                onChange={setClientQuery}
                onSearch={() => loadClients(clientQuery)}
                placeholder={t("clients.searchPlaceholder")}
              />
              <div
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  border: "1px solid #E2E8F0",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  {tableHead(t.raw("clients.cols"))}
                  <tbody>
                    {clients.map((c, i) => (
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
                          {c.firstName} {c.lastName}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: 13,
                            color: palette.slate,
                          }}
                        >
                          {c.companyName ?? "—"}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: 12,
                            color: palette.muted,
                          }}
                        >
                          {c.email}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: 12,
                            color: palette.muted,
                          }}
                        >
                          {fmtDate(c.createdAt)}
                        </td>
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: 12,
                            color: palette.muted,
                          }}
                        >
                          {c.mfaEnrolled ? t("yes") : t("no")}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <StatusBadge
                            status={c.disabledAt ? "denied" : "approved"}
                          />
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <button
                            onClick={() => toggleClientStatus(c)}
                            style={{
                              background: c.disabledAt ? "#166534" : "#991B1B",
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
                            {c.disabledAt
                              ? t("clients.enable")
                              : t("clients.disable")}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {clients.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          style={{
                            padding: 24,
                            textAlign: "center",
                            fontSize: 13,
                            color: palette.muted,
                          }}
                        >
                          {t("clients.none")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {}
          {section === "specs" && (
            <div
              className="responsive-card-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 16,
              }}
            >
              {services.map((svc) => {
                const files = serviceFiles[svc.id] ?? []
                const latest = files[0]
                return (
                  <div
                    key={svc.id}
                    style={{
                      background: "#fff",
                      borderRadius: 16,
                      padding: "22px",
                      border: `1px solid ${
                        latest ? palette.accent : "#E2E8F0"
                      }`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: palette.navy,
                        marginBottom: 14,
                      }}
                    >
                      {svc.name}
                    </div>
                    {latest ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: "#059669",
                          fontWeight: 600,
                          marginBottom: 14,
                        }}
                      >
                        ✅ {latest.originalFilename} (v{latest.version})
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 12,
                          color: palette.muted,
                          marginBottom: 14,
                        }}
                      >
                        {t("specs.noFile")}
                      </div>
                    )}
                    <input
                      ref={(el) => {
                        fileInputRefs.current[svc.id] = el
                      }}
                      type="file"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleFileSelected(svc.id, f)
                      }}
                    />
                    <button
                      onClick={() => uploadSpec(svc.id)}
                      disabled={uploadingId === svc.id}
                      style={{
                        width: "100%",
                        padding: "9px",
                        background: latest ? "#F1F5F9" : palette.accent,
                        color: latest ? palette.slate : "#fff",
                        border: "none",
                        borderRadius: 9999,
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: "pointer",
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      {uploadingId === svc.id ? (
                        <>
                          <InlineSpinner size={13} /> {t("specs.uploading")}
                        </>
                      ) : latest ? (
                        t("specs.replaceFile")
                      ) : (
                        t("specs.uploadFile")
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {}
          {section === "requests" && (
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
                  border: "1px solid #E2E8F0",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  {tableHead(t.raw("requests.cols"))}
                  <tbody>
                    {requests.map((r, i) => (
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
                    {requests.length === 0 && (
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
                </table>
              </div>
            </>
          )}

          {}
          {section === "positions" && (
            <>
              <form
                onSubmit={savePosition}
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  border: "1px solid #E2E8F0",
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
                      required
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: 10,
                        border: "1.5px solid #E2E8F0",
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
                      required
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: 10,
                        border: "1.5px solid #E2E8F0",
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
                    required
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: 10,
                      border: "1.5px solid #E2E8F0",
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
                      color: "#fff",
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
                        border: "1.5px solid #E2E8F0",
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
                  border: "1px solid #E2E8F0",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  {tableHead(t.raw("positions.cols"))}
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
                                background: "#F1F5F9",
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
                </table>
              </div>
            </>
          )}

          {}
          {section === "candidates" && (
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
                  border: "1px solid #E2E8F0",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  {tableHead(t.raw("candidates.cols"))}
                  <tbody>
                    {candidates.map((c, i) => (
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
                                  : "#F1F5F9",
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
                    {candidates.length === 0 && (
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
                </table>
              </div>
            </>
          )}

          {}
          {section === "rfqs" && (
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
                  border: "1px solid #E2E8F0",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  {tableHead(t.raw("rfqs.cols"))}
                  <tbody>
                    {rfqs.map((r, i) => (
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
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                    {rfqs.length === 0 && (
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
                          {t("rfqs.none")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {}
          {section === "bookings" && (
            <>
              <form
                onSubmit={createSlot}
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  border: "1px solid #E2E8F0",
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
                      border: "1.5px solid #E2E8F0",
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
                      border: "1.5px solid #E2E8F0",
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
                      border: "1.5px solid #E2E8F0",
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
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "Poppins, sans-serif",
                  }}
                >
                  {t("bookings.addSlot")}
                </button>
              </form>

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
                  border: "1px solid #E2E8F0",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  {tableHead(t.raw("bookings.cols"))}
                  <tbody>
                    {appointments.map((b, i) => (
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
                        <td
                          style={{
                            padding: "14px 16px",
                            fontSize: 12,
                            color: palette.muted,
                          }}
                        >
                          {fmtDate(b.createdAt)}
                        </td>
                      </tr>
                    ))}
                    {appointments.length === 0 && (
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
                          {t("bookings.none")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {}
          {section === "audit" && (
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
                  border: "1px solid #E2E8F0",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  {tableHead(t.raw("audit.cols"))}
                  <tbody>
                    {auditLog.map((a, i) => (
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
                            color: palette.accent,
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
                    {auditLog.length === 0 && (
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
                </table>
              </div>
            </>
          )}

          {}
          {section === "security" && <AdminSecuritySection />}
        </main>
      </div>
      </div>
    </div>
  )
}
