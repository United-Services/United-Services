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
 
/* Sidebar */ /* Main */ /* OVERVIEW */ /* CLIENTS */ /* SPEC FILES */ /* FILE REQUESTS */ /* POSITIONS */ /* CANDIDATES */ /* RFQs */ /* BOOKINGS */ /* AUDIT LOG */ /* SECURITY */

import { useEffect, useRef, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { InlineSpinner } from "../components/Spinner"
import {
  IconChart,
  IconHome,
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
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import WorldMap from "../components/WorldMap"
import ErrorBanner from "../components/ErrorBanner"
import PublicNav from "../components/PublicNav"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { useRequestGuard } from "../lib/useRequestGuard"
import { usePaginatedList } from "../lib/usePaginatedList"
import AdminSecuritySection from "./AdminSecuritySection"
import {
  FileAccessStatus,
  ApplicationStatus,
  AppointmentStatus,
  Role,
} from "../enums/status.enums"

interface Props {
  onLogout: () => void
  onNavigate: (page: string) => void
}

interface Service {
  id: string
  slug: string
  name: string
  shortDescription: string
  longDescription: string
  specs: string[]
  order: number
  imageUrl: string | null
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
  mustChangePassword: boolean
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
interface AuditLogRow {
  id: string
  action: string
  targetType: string
  targetId: string
  createdAt: string
  actor: { firstName: string; lastName: string; email: string; role: string }
}
interface CountRow {
  eventType?: string
  status?: string
  count: number
}
interface Overview {
  clientCount: number
  companyCount: number
  fileAccessRequested: number
  fileAccessApproved: number
  rfqCount: number
  appointmentCount: number
  candidatesByStatus: CountRow[]
  ctaClicks: CountRow[]
  serviceViews: CountRow[]
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString()
const fmtDateTime = (d: string) => new Date(d).toLocaleString()
const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })

// Hoisted to module scope (was defined inline in AdminDashboard's render
// body) — a component defined during render gets a new identity every
// render, which forces React to remount it instead of reconciling. Calls
// its own useTranslations() rather than taking `t` as a prop — a hook
// works the same from any component, not just the one that originally
// called it.
function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("adminDashboard")
  const map: Record<string, { bg: string; color: string }> = {
    pending: { bg: "#FEF3C7", color: "#92400E" },
    approved: { bg: "#DCFCE7", color: "#166534" },
    open: { bg: "#DCFCE7", color: "#166534" },
    denied: { bg: "#FEE2E2", color: "#991B1B" },
    in_review: { bg: "#DBEAFE", color: "#1E40AF" },
    quoted: { bg: "#F3F4F6", color: "#374151" },
    closed: { bg: "#F3F2EE", color: "#475569" },
    booked: { bg: "#DBEAFE", color: "#1E40AF" },
    done: { bg: "#DCFCE7", color: "#166534" },
    cancelled: { bg: "#FEE2E2", color: "#991B1B" },
    contacted: { bg: "#DCFCE7", color: "#166534" },
  }
  const s = map[status] ?? { bg: "#F3F2EE", color: "#475569" }
  const label = t.has(`status.${status}`) ? t(`status.${status}` as any) : status
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

// Shared field styling for the services create/edit forms — plain style
// objects, not components, so module scope (no remount concerns) is just
// to avoid re-allocating the same object every render.
const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: palette.navy,
  marginBottom: 6,
}
const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1.5px solid #E6E5E0",
  fontSize: 13,
  fontFamily: "Poppins, sans-serif",
}

// Hoisted to module scope (was defined inline in AdminDashboard's render
// body) — a component defined during render gets a new identity every
// render, which forces React to remount it instead of reconciling, so
// this input would lose focus on every keystroke-triggered re-render.
// Fuzzy-matched live search — see backend/src/common/utils/fuzzy-match.ts.
// No submit button: typing debounces straight into onSearch, so there's
// nothing to click and no stale "did I search yet?" state to track.
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
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const timer = setTimeout(() => onSearch(), 300)
    return () => clearTimeout(timer)
    // Deliberately keyed only on `value` — onSearch is a fresh closure
    // every parent render (it always captures the current query text
    // itself), so including it here would re-fire the debounce on every
    // unrelated re-render instead of just when the user actually types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div
      style={{
        marginBottom: 16,
        display: "flex",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          maxWidth: 320,
          padding: "9px 14px",
          borderRadius: 9999,
          border: "1.5px solid #E6E5E0",
          fontSize: 13,
          fontFamily: "Poppins, sans-serif",
          outline: "none",
        }}
      />
    </div>
  )
}

function LoadMoreButton({
  hasMore,
  loading,
  onClick,
}: {
  hasMore: boolean
  loading: boolean
  onClick: () => void
}) {
  const tCommon = useTranslations("common")
  if (!hasMore) return null
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
      <button
        onClick={onClick}
        disabled={loading}
        style={{
          background: "#F3F2EE",
          color: palette.navy,
          border: "1.5px solid #E6E5E0",
          borderRadius: 9999,
          padding: "9px 22px",
          fontWeight: 600,
          fontSize: 13,
          cursor: loading ? "default" : "pointer",
          fontFamily: "Poppins, sans-serif",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {loading && <InlineSpinner size={13} />}
        {loading ? tCommon("loadingMore") : tCommon("loadMore")}
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
  const positionsGuard = useRequestGuard()
  const slotsGuard = useRequestGuard()

  // Backend list endpoints (clients/requests/candidates/rfqs/appointments/
  // audit log) are paginated 20-at-a-time with a Load More button — see
  // usePaginatedList and backend/src/common/utils/paginate.ts. Each list's
  // own request guard lives inside the hook.
  const onListError = (err: unknown) =>
    setError(getErrorMessage(err, tCommon("errors.loadFailed")))
  const clientsList = usePaginatedList<AdminUser>(onListError)
  const requestsList = usePaginatedList<FileRequestRow>(onListError)
  const candidatesList = usePaginatedList<CandidateRow>(onListError)
  const rfqsList = usePaginatedList<RfqRow>(onListError)
  const appointmentsList = usePaginatedList<AppointmentRow>(onListError)
  const auditLogList = usePaginatedList<AuditLogRow>(onListError)

  const NAV = [
    { id: "overview", label: t("nav.overview"), icon: <IconHome /> },
    { id: "analytics", label: t("nav.analytics"), icon: <IconChart /> },
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
  const [clientQuery, setClientQuery] = useState("")
  const [clientRoleFilter, setClientRoleFilter] = useState("")
  const [showCreateUserForm, setShowCreateUserForm] = useState(false)
  const [newUserForm, setNewUserForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: Role.Client,
    companyName: "",
    phone: "",
  })
  const [creatingUser, setCreatingUser] = useState(false)
  const [tempPasswordResult, setTempPasswordResult] = useState<{
    email: string
    tempPassword: string
  } | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [serviceFiles, setServiceFiles] =
    useState<Record<string, ServiceFile[]>>({})
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(
    null,
  )
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [editingServiceId, setEditingServiceId] = useState<string | null>(
    null,
  )
  const [serviceEditForm, setServiceEditForm] = useState({
    name: "",
    shortDescription: "",
    longDescription: "",
    specs: "",
  })
  const [savingService, setSavingService] = useState(false)
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(
    null,
  )
  const [showCreateServiceForm, setShowCreateServiceForm] = useState(false)
  const [newServiceForm, setNewServiceForm] = useState({
    slug: "",
    name: "",
    shortDescription: "",
    longDescription: "",
    specs: "",
  })
  const [creatingService, setCreatingService] = useState(false)
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
  const [candidateQuery, setCandidateQuery] = useState("")
  const [viewingRfq, setViewingRfq] = useState<RfqRow | null>(null)
  const [rfqQuery, setRfqQuery] = useState("")
  const [bookingQuery, setBookingQuery] = useState("")
  const [newSlot, setNewSlot] = useState({
    date: "",
    startTime: "",
    endTime: "",
  })
  const [slots, setSlots] = useState<SlotRow[]>([])
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [slotEditForm, setSlotEditForm] = useState({
    date: "",
    startTime: "",
    endTime: "",
  })
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
  const clientsFetchPage =
    (q: string, role: string) => async (skip: number, take: number) => {
      const headers = await authed()
      const { data } = await axios.get("/admin/users", {
        headers,
        params: { role: role || undefined, q: q || undefined, skip, take },
      })
      return data
    }
  const loadClients = (q = "", role = clientRoleFilter) =>
    clientsList.reload(clientsFetchPage(q, role))
  const loadMoreClients = () =>
    clientsList.loadMore(clientsFetchPage(clientQuery, clientRoleFilter))
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
    }
  }
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
    loadSlots()
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

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUserForm.email || !newUserForm.firstName || !newUserForm.lastName)
      return
    setCreatingUser(true)
    try {
      const headers = await authed()
      const { data } = await axios.post(
        "/admin/users",
        {
          email: newUserForm.email,
          firstName: newUserForm.firstName,
          lastName: newUserForm.lastName,
          role: newUserForm.role,
          companyName: newUserForm.companyName || undefined,
          phone: newUserForm.phone || undefined,
        },
        { headers },
      )
      setTempPasswordResult({
        email: newUserForm.email,
        tempPassword: data.tempPassword,
      })
      setNewUserForm({
        email: "",
        firstName: "",
        lastName: "",
        role: Role.Client,
        companyName: "",
        phone: "",
      })
      setShowCreateUserForm(false)
      loadClients(clientQuery)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setCreatingUser(false)
    }
  }

  const changeUserRole = async (u: AdminUser, role: string) => {
    if (role === u.role) return
    try {
      const headers = await authed()
      await axios.patch(`/admin/users/${u.id}/role`, { role }, { headers })
      loadClients(clientQuery)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    }
  }

  const resetUserPassword = async (u: AdminUser) => {
    try {
      const headers = await authed()
      const { data } = await axios.post(
        `/admin/users/${u.id}/reset-password`,
        {},
        { headers },
      )
      setTempPasswordResult({ email: u.email, tempPassword: data.tempPassword })
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

  const uploadServiceImage = (serviceId: string) =>
    imageInputRefs.current[serviceId]?.click()

  const handleServiceImageSelected = async (
    serviceId: string,
    file: File,
  ) => {
    setUploadingImageId(serviceId)
    try {
      const headers = await authed()
      const { data: presign } = await axios.post(
        `/services/${serviceId}/image/presign`,
        { contentType: file.type },
        { headers },
      )
      await fetch(presign.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      })
      const { data: updated } = await axios.post(
        `/services/${serviceId}/image`,
        { s3Key: presign.key },
        { headers },
      )
      setServices((prev) =>
        prev.map((s) => (s.id === serviceId ? { ...s, ...updated } : s)),
      )
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setUploadingImageId(null)
    }
  }

  const startEditService = (svc: Service) => {
    setEditingServiceId(svc.id)
    setServiceEditForm({
      name: svc.name,
      shortDescription: svc.shortDescription,
      longDescription: svc.longDescription,
      specs: svc.specs.join(", "),
    })
  }

  const cancelEditService = () => setEditingServiceId(null)

  const saveServiceEdit = async (serviceId: string) => {
    setSavingService(true)
    try {
      const headers = await authed()
      const { data: updated } = await axios.patch(
        `/services/${serviceId}`,
        {
          name: serviceEditForm.name,
          shortDescription: serviceEditForm.shortDescription,
          longDescription: serviceEditForm.longDescription,
          specs: serviceEditForm.specs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        { headers },
      )
      setServices((prev) =>
        prev.map((s) => (s.id === serviceId ? { ...s, ...updated } : s)),
      )
      setEditingServiceId(null)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setSavingService(false)
    }
  }

  const deleteService = async (svc: Service) => {
    if (!window.confirm(t("specs.confirmDelete", { name: svc.name }))) return
    setDeletingServiceId(svc.id)
    try {
      const headers = await authed()
      await axios.delete(`/services/${svc.id}`, { headers })
      setServices((prev) => prev.filter((s) => s.id !== svc.id))
      setServiceFiles((prev) => {
        const next = { ...prev }
        delete next[svc.id]
        return next
      })
    } catch (err) {
      // The backend's message is specific and actionable here (e.g. "has
      // existing RFQs against it") — worth showing over the generic
      // fallback, which getErrorMessage already does when present.
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setDeletingServiceId(null)
    }
  }

  const createService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      !newServiceForm.slug ||
      !newServiceForm.name ||
      !newServiceForm.shortDescription ||
      !newServiceForm.longDescription
    )
      return
    setCreatingService(true)
    try {
      const headers = await authed()
      const { data: created } = await axios.post(
        "/services",
        {
          slug: newServiceForm.slug,
          name: newServiceForm.name,
          shortDescription: newServiceForm.shortDescription,
          longDescription: newServiceForm.longDescription,
          specs: newServiceForm.specs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        { headers },
      )
      setServices((prev) => [...prev, created])
      setNewServiceForm({
        slug: "",
        name: "",
        shortDescription: "",
        longDescription: "",
        specs: "",
      })
      setShowCreateServiceForm(false)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setCreatingService(false)
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
              borderBottom: "1px solid #E6E5E0",
              background: "#F3F2EE",
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
          background: "#F3F2EE",
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
                color: section === n.id ? palette.accent : "#8C8C88",
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
            borderBottom: "1px solid #E6E5E0",
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
                      border: "1px solid #E6E5E0",
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
                  border: "1px solid #E6E5E0",
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
                          borderBottom: "1px solid #F3F2EE",
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
                  border: "1px solid #E6E5E0",
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
                {auditLogList.items.slice(0, 6).map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      padding: "12px 0",
                      borderBottom: "1px solid #F3F2EE",
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
                {auditLogList.items.length === 0 && (
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
          {section === "analytics" && overview && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 24,
              }}
            >
              {[
                {
                  title: t("analytics.candidatesByStatus"),
                  sub: t("analytics.candidatesByStatusSub"),
                  data: overview.candidatesByStatus.map((c) => ({
                    label: c.status ?? "",
                    count: c.count,
                  })),
                  empty: t("analytics.noCandidates"),
                },
                {
                  title: t("analytics.ctaClicks"),
                  sub: t("analytics.ctaClicksSub"),
                  data: overview.ctaClicks.map((c) => ({
                    label: (c.eventType ?? "")
                      .replace(/^cta_click_?/, "")
                      .replace(/_/g, " "),
                    count: c.count,
                  })),
                  empty: t("analytics.noEvents"),
                },
                {
                  title: t("analytics.serviceViews"),
                  sub: t("analytics.serviceViewsSub"),
                  data: overview.serviceViews.map((c) => ({
                    label: (c.eventType ?? "")
                      .replace(/^service_page_view_?/, "")
                      .replace(/-/g, " "),
                    count: c.count,
                  })),
                  empty: t("analytics.noEvents"),
                },
              ].map((chart) => (
                <div
                  key={chart.title}
                  style={{
                    background: "#fff",
                    borderRadius: 16,
                    padding: 24,
                    border: "1px solid #E6E5E0",
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
                    {chart.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: palette.muted,
                      marginBottom: 16,
                    }}
                  >
                    {chart.sub}
                  </div>
                  {chart.data.length === 0 ? (
                    <div style={{ fontSize: 13, color: palette.muted }}>
                      {chart.empty}
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={chart.data}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#F3F2EE"
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11, fill: palette.muted }}
                          style={{ fontFamily: "Poppins, sans-serif" }}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 11, fill: palette.muted }}
                          style={{ fontFamily: "Poppins, sans-serif" }}
                        />
                        <Tooltip
                          contentStyle={{
                            fontFamily: "Poppins, sans-serif",
                            fontSize: 12,
                            borderRadius: 8,
                          }}
                        />
                        <Bar
                          dataKey="count"
                          fill={palette.accent}
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              ))}
            </div>
          )}

          {}
          {section === "clients" && (
            <>
              {tempPasswordResult && (
                <div
                  style={{
                    background: palette.accentLight,
                    border: `1.5px solid ${palette.accent}`,
                    borderRadius: 16,
                    padding: 20,
                    marginBottom: 20,
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: palette.navy,
                      marginBottom: 6,
                    }}
                  >
                    {t("clients.tempPasswordHeading", {
                      email: tempPasswordResult.email,
                    })}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: palette.muted,
                      marginBottom: 12,
                    }}
                  >
                    {t("clients.tempPasswordSub")}
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <code
                      style={{
                        background: "#fff",
                        border: "1px solid #E6E5E0",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontSize: 14,
                        fontWeight: 700,
                        color: palette.navy,
                        letterSpacing: "0.02em",
                      }}
                    >
                      {tempPasswordResult.tempPassword}
                    </code>
                    <button
                      onClick={() =>
                        navigator.clipboard.writeText(
                          tempPasswordResult.tempPassword,
                        )
                      }
                      style={{
                        background: "#F3F2EE",
                        color: palette.slate,
                        border: "none",
                        borderRadius: 9999,
                        padding: "8px 16px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      {t("clients.copy")}
                    </button>
                    <button
                      onClick={() => setTempPasswordResult(null)}
                      style={{
                        background: "none",
                        border: "none",
                        color: palette.muted,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "Poppins, sans-serif",
                        marginLeft: "auto",
                      }}
                    >
                      {t("clients.dismiss")}
                    </button>
                  </div>
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <SearchBox
                  value={clientQuery}
                  onChange={setClientQuery}
                  onSearch={() => loadClients(clientQuery)}
                  placeholder={t("clients.searchPlaceholder")}
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <select
                    value={clientRoleFilter}
                    onChange={(e) => {
                      setClientRoleFilter(e.target.value)
                      loadClients(clientQuery, e.target.value)
                    }}
                    style={{
                      padding: "9px 14px",
                      borderRadius: 9999,
                      border: "1.5px solid #E6E5E0",
                      fontSize: 13,
                      fontFamily: "Poppins, sans-serif",
                      color: palette.slate,
                    }}
                  >
                    <option value="">{t("clients.allRoles")}</option>
                    <option value={Role.Client}>{t("clients.roleClient")}</option>
                    <option value={Role.Candidate}>
                      {t("clients.roleCandidate")}
                    </option>
                    <option value={Role.Admin}>{t("clients.roleAdmin")}</option>
                  </select>
                  <button
                    onClick={() => setShowCreateUserForm((v) => !v)}
                    style={{
                      padding: "9px 18px",
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
                    {t("clients.addUser")}
                  </button>
                </div>
              </div>

              {showCreateUserForm && (
                <form
                  onSubmit={createUser}
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
                      {t("clients.firstName")}
                    </label>
                    <input
                      value={newUserForm.firstName}
                      onChange={(e) =>
                        setNewUserForm((f) => ({
                          ...f,
                          firstName: e.target.value,
                        }))
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
                      {t("clients.lastName")}
                    </label>
                    <input
                      value={newUserForm.lastName}
                      onChange={(e) =>
                        setNewUserForm((f) => ({
                          ...f,
                          lastName: e.target.value,
                        }))
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
                      {t("clients.email")}
                    </label>
                    <input
                      type="email"
                      value={newUserForm.email}
                      onChange={(e) =>
                        setNewUserForm((f) => ({ ...f, email: e.target.value }))
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
                      {t("clients.companyName")}
                    </label>
                    <input
                      value={newUserForm.companyName}
                      onChange={(e) =>
                        setNewUserForm((f) => ({
                          ...f,
                          companyName: e.target.value,
                        }))
                      }
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
                      {t("clients.role")}
                    </label>
                    <select
                      value={newUserForm.role}
                      onChange={(e) =>
                        setNewUserForm((f) => ({ ...f, role: e.target.value as Role }))
                      }
                      style={{
                        padding: "9px 12px",
                        borderRadius: 10,
                        border: "1.5px solid #E6E5E0",
                        fontSize: 13,
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      <option value={Role.Client}>{t("clients.roleClient")}</option>
                      <option value={Role.Candidate}>
                        {t("clients.roleCandidate")}
                      </option>
                      <option value={Role.Admin}>{t("clients.roleAdmin")}</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={creatingUser}
                    style={{
                      padding: "10px 22px",
                      borderRadius: 9999,
                      border: "none",
                      background: palette.accent,
                      color: palette.navy,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: creatingUser ? "default" : "pointer",
                      fontFamily: "Poppins, sans-serif",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {creatingUser && <InlineSpinner size={13} />}
                    {t("clients.createAccount")}
                  </button>
                </form>
              )}

              <div
                style={{
                  background: "#fff",
                  borderRadius: 16,
                  border: "1px solid #E6E5E0",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  {tableHead(t.raw("clients.cols"))}
                  <tbody>
                    {clientsList.items.map((c, i) => (
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
                          {c.mustChangePassword && (
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: palette.accent,
                                marginTop: 2,
                              }}
                            >
                              {t("clients.pendingPasswordChange")}
                            </div>
                          )}
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
                        <td style={{ padding: "14px 16px" }}>
                          <select
                            value={c.role}
                            onChange={(e) => changeUserRole(c, e.target.value)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 8,
                              border: "1.5px solid #E6E5E0",
                              fontSize: 12,
                              fontFamily: "Poppins, sans-serif",
                              color: palette.slate,
                            }}
                          >
                            <option value={Role.Client}>
                              {t("clients.roleClient")}
                            </option>
                            <option value={Role.Candidate}>
                              {t("clients.roleCandidate")}
                            </option>
                            <option value={Role.Admin}>
                              {t("clients.roleAdmin")}
                            </option>
                          </select>
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
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              onClick={() => resetUserPassword(c)}
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
                              {t("clients.resetPassword")}
                            </button>
                            <button
                              onClick={() => toggleClientStatus(c)}
                              style={{
                                background: c.disabledAt
                                  ? "#166534"
                                  : "#991B1B",
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
                          </div>
                        </td>
                      </tr>
                    ))}
                    {clientsList.items.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
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
                <LoadMoreButton
                  hasMore={clientsList.hasMore}
                  loading={clientsList.loadingMore}
                  onClick={loadMoreClients}
                />
              </div>
            </>
          )}

          {}
          {section === "specs" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                <button
                  onClick={() => setShowCreateServiceForm((v) => !v)}
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
                  {showCreateServiceForm
                    ? t("specs.cancel")
                    : t("specs.addService")}
                </button>
              </div>

              {showCreateServiceForm && (
                <form
                  onSubmit={createService}
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
                    {t("specs.createHeading")}
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
                      <label style={fieldLabelStyle}>{t("specs.slug")}</label>
                      <input
                        value={newServiceForm.slug}
                        onChange={(e) =>
                          setNewServiceForm((f) => ({
                            ...f,
                            slug: e.target.value,
                          }))
                        }
                        placeholder={t("specs.slugPlaceholder")}
                        required
                        style={fieldInputStyle}
                      />
                    </div>
                    <div>
                      <label style={fieldLabelStyle}>{t("specs.name")}</label>
                      <input
                        value={newServiceForm.name}
                        onChange={(e) =>
                          setNewServiceForm((f) => ({
                            ...f,
                            name: e.target.value,
                          }))
                        }
                        placeholder={t("specs.namePlaceholder")}
                        required
                        style={fieldInputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={fieldLabelStyle}>
                      {t("specs.shortDescription")}
                    </label>
                    <input
                      value={newServiceForm.shortDescription}
                      onChange={(e) =>
                        setNewServiceForm((f) => ({
                          ...f,
                          shortDescription: e.target.value,
                        }))
                      }
                      placeholder={t("specs.shortDescriptionPlaceholder")}
                      required
                      style={fieldInputStyle}
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={fieldLabelStyle}>
                      {t("specs.longDescription")}
                    </label>
                    <textarea
                      value={newServiceForm.longDescription}
                      onChange={(e) =>
                        setNewServiceForm((f) => ({
                          ...f,
                          longDescription: e.target.value,
                        }))
                      }
                      placeholder={t("specs.longDescriptionPlaceholder")}
                      required
                      rows={3}
                      style={{ ...fieldInputStyle, resize: "vertical" }}
                    />
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={fieldLabelStyle}>
                      {t("specs.specsLabel")}
                    </label>
                    <input
                      value={newServiceForm.specs}
                      onChange={(e) =>
                        setNewServiceForm((f) => ({
                          ...f,
                          specs: e.target.value,
                        }))
                      }
                      placeholder={t("specs.specsPlaceholder")}
                      style={fieldInputStyle}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={creatingService}
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
                    {creatingService && <InlineSpinner size={13} />}{" "}
                    {t("specs.createService")}
                  </button>
                </form>
              )}

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
                  const editing = editingServiceId === svc.id
                  return (
                    <div
                      key={svc.id}
                      style={{
                        background: "#fff",
                        borderRadius: 16,
                        padding: "22px",
                        border: `1px solid ${
                          latest ? palette.accent : "#E6E5E0"
                        }`,
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          aspectRatio: "16/9",
                          borderRadius: 10,
                          overflow: "hidden",
                          background: "#F3F2EE",
                          marginBottom: 14,
                        }}
                      >
                        {svc.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element -- admin-only tool, S3 presigned URL not known to next/image at build time
                          <img
                            src={svc.imageUrl}
                            alt={svc.name}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        )}
                      </div>
                      <input
                        ref={(el) => {
                          imageInputRefs.current[svc.id] = el
                        }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleServiceImageSelected(svc.id, f)
                        }}
                      />
                      <button
                        onClick={() => uploadServiceImage(svc.id)}
                        disabled={uploadingImageId === svc.id}
                        style={{
                          width: "100%",
                          padding: "8px",
                          marginBottom: 14,
                          background: "#F3F2EE",
                          color: palette.slate,
                          border: "none",
                          borderRadius: 9999,
                          fontWeight: 600,
                          fontSize: 12,
                          cursor: "pointer",
                          fontFamily: "Poppins, sans-serif",
                        }}
                      >
                        {uploadingImageId === svc.id ? (
                          <>
                            <InlineSpinner size={12} /> {t("specs.uploading")}
                          </>
                        ) : svc.imageUrl ? (
                          t("specs.replaceImage")
                        ) : (
                          t("specs.uploadImage")
                        )}
                      </button>

                      {editing ? (
                        <div style={{ marginBottom: 14 }}>
                          <input
                            value={serviceEditForm.name}
                            onChange={(e) =>
                              setServiceEditForm((f) => ({
                                ...f,
                                name: e.target.value,
                              }))
                            }
                            placeholder={t("specs.name")}
                            style={{ ...fieldInputStyle, marginBottom: 8 }}
                          />
                          <input
                            value={serviceEditForm.shortDescription}
                            onChange={(e) =>
                              setServiceEditForm((f) => ({
                                ...f,
                                shortDescription: e.target.value,
                              }))
                            }
                            placeholder={t("specs.shortDescription")}
                            style={{ ...fieldInputStyle, marginBottom: 8 }}
                          />
                          <textarea
                            value={serviceEditForm.longDescription}
                            onChange={(e) =>
                              setServiceEditForm((f) => ({
                                ...f,
                                longDescription: e.target.value,
                              }))
                            }
                            placeholder={t("specs.longDescription")}
                            rows={3}
                            style={{
                              ...fieldInputStyle,
                              resize: "vertical",
                              marginBottom: 8,
                            }}
                          />
                          <input
                            value={serviceEditForm.specs}
                            onChange={(e) =>
                              setServiceEditForm((f) => ({
                                ...f,
                                specs: e.target.value,
                              }))
                            }
                            placeholder={t("specs.specsPlaceholder")}
                            style={fieldInputStyle}
                          />
                        </div>
                      ) : (
                        <>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: palette.navy,
                              marginBottom: 4,
                            }}
                          >
                            {svc.name}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: palette.muted,
                              marginBottom: 14,
                            }}
                          >
                            {svc.shortDescription}
                          </div>
                        </>
                      )}

                      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                        {editing ? (
                          <>
                            <button
                              onClick={() => saveServiceEdit(svc.id)}
                              disabled={savingService}
                              style={{
                                flex: 1,
                                padding: "8px",
                                background: palette.accent,
                                color: palette.navy,
                                border: "none",
                                borderRadius: 9999,
                                fontWeight: 600,
                                fontSize: 12,
                                cursor: "pointer",
                                fontFamily: "Poppins, sans-serif",
                              }}
                            >
                              {savingService ? (
                                <InlineSpinner size={12} />
                              ) : (
                                t("specs.save")
                              )}
                            </button>
                            <button
                              onClick={cancelEditService}
                              style={{
                                flex: 1,
                                padding: "8px",
                                background: "#fff",
                                color: palette.navy,
                                border: "1.5px solid #E6E5E0",
                                borderRadius: 9999,
                                fontWeight: 600,
                                fontSize: 12,
                                cursor: "pointer",
                                fontFamily: "Poppins, sans-serif",
                              }}
                            >
                              {t("specs.cancel")}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEditService(svc)}
                              style={{
                                flex: 1,
                                padding: "8px",
                                background: "#fff",
                                color: palette.navy,
                                border: "1.5px solid #E6E5E0",
                                borderRadius: 9999,
                                fontWeight: 600,
                                fontSize: 12,
                                cursor: "pointer",
                                fontFamily: "Poppins, sans-serif",
                              }}
                            >
                              {t("specs.edit")}
                            </button>
                            <button
                              onClick={() => deleteService(svc)}
                              disabled={deletingServiceId === svc.id}
                              style={{
                                flex: 1,
                                padding: "8px",
                                background: "#fff",
                                color: "#DC2626",
                                border: "1.5px solid #FCA5A5",
                                borderRadius: 9999,
                                fontWeight: 600,
                                fontSize: 12,
                                cursor: "pointer",
                                fontFamily: "Poppins, sans-serif",
                              }}
                            >
                              {deletingServiceId === svc.id ? (
                                <InlineSpinner size={12} />
                              ) : (
                                t("specs.delete")
                              )}
                            </button>
                          </>
                        )}
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
                          background: latest ? "#F3F2EE" : palette.accent,
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
            </>
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
                  border: "1px solid #E6E5E0",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  {tableHead(t.raw("requests.cols"))}
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
                </table>
                <LoadMoreButton
                  hasMore={requestsList.hasMore}
                  loading={requestsList.loadingMore}
                  onClick={loadMoreRequests}
                />
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
                  border: "1px solid #E6E5E0",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  {tableHead(t.raw("candidates.cols"))}
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
                </table>
                <LoadMoreButton
                  hasMore={candidatesList.hasMore}
                  loading={candidatesList.loadingMore}
                  onClick={loadMoreCandidates}
                />
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
                  border: "1px solid #E6E5E0",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  {tableHead(t.raw("rfqs.cols"))}
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
          )}

          {}
          {section === "bookings" && (
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
                </table>
                <LoadMoreButton
                  hasMore={appointmentsList.hasMore}
                  loading={appointmentsList.loadingMore}
                  onClick={loadMoreAppointments}
                />
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
                  border: "1px solid #E6E5E0",
                  overflow: "hidden",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  {tableHead(t.raw("audit.cols"))}
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
                </table>
                <LoadMoreButton
                  hasMore={auditLogList.hasMore}
                  loading={auditLogList.loadingMore}
                  onClick={loadMoreAuditLog}
                />
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
