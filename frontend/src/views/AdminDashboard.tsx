'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { palette } from '../theme'
import { api, authHeader } from '../lib/api'
import AdminSecuritySection from './AdminSecuritySection'

interface Props { onLogout: () => void; onNavigate: (page: string) => void }

interface Service { id: string; slug: string; name: string }
interface ServiceFile { id: string; originalFilename: string; version: number; uploadedAt: string }
interface AdminUser {
  id: string; firstName: string; lastName: string; email: string; companyName: string | null
  role: string; createdAt: string; disabledAt: string | null; mfaEnrolled: boolean
}
interface FileRequestRow {
  id: string; status: 'pending' | 'approved' | 'denied'; requestedAt: string
  client: { firstName: string; lastName: string; email: string; companyName: string | null }
  serviceFile: { id: string; originalFilename: string; service: { name: string; slug: string } }
}
interface CandidateRow {
  id: string; status: 'pending' | 'approved' | 'denied'; dateOfBirth: string
  candidateUser: { firstName: string; lastName: string; email: string }
  position: { title: string; department: string } | null
}
interface RfqRow {
  id: string; status: string; createdAt: string; projectDetails: string
  client: { firstName: string; lastName: string; companyName: string | null }
  service: { name: string } | null
}
interface AppointmentRow {
  id: string; createdAt: string
  slot: { date: string; startTime: string; endTime: string }
  client: { firstName: string; lastName: string; companyName: string | null }
}
interface AuditLogRow {
  id: string; action: string; targetType: string; targetId: string; createdAt: string
  actor: { firstName: string; lastName: string; email: string; role: string }
}
interface Overview {
  clientCount: number; companyCount: number; fileAccessRequested: number; fileAccessApproved: number
  rfqCount: number; appointmentCount: number
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString()
const fmtDateTime = (d: string) => new Date(d).toLocaleString()
const fmtTime = (d: string) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export default function AdminDashboard({ onLogout, onNavigate }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations('adminDashboard')
  const [section, setSection] = useState('overview')
  const authed = async () => authHeader(await getToken())

  const NAV = [
    { id: 'overview', label: t('nav.overview'), icon: '📊' },
    { id: 'clients', label: t('nav.clients'), icon: '👥' },
    { id: 'specs', label: t('nav.specs'), icon: '📁' },
    { id: 'requests', label: t('nav.requests'), icon: '📋' },
    { id: 'candidates', label: t('nav.candidates'), icon: '🎓' },
    { id: 'rfqs', label: t('nav.rfqs'), icon: '💼' },
    { id: 'bookings', label: t('nav.bookings'), icon: '📅' },
    { id: 'audit', label: t('nav.audit'), icon: '🧾' },
    { id: 'security', label: t('nav.security'), icon: '🔒' },
  ]

  // Overview
  const [overview, setOverview] = useState<Overview | null>(null)

  // Clients
  const [clients, setClients] = useState<AdminUser[]>([])
  const [clientQuery, setClientQuery] = useState('')

  // Specs
  const [services, setServices] = useState<Service[]>([])
  const [serviceFiles, setServiceFiles] = useState<Record<string, ServiceFile[]>>({})
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Requests
  const [requests, setRequests] = useState<FileRequestRow[]>([])
  const [requestQuery, setRequestQuery] = useState('')

  // Candidates
  const [candidates, setCandidates] = useState<CandidateRow[]>([])
  const [candidateQuery, setCandidateQuery] = useState('')

  // RFQs
  const [rfqs, setRfqs] = useState<RfqRow[]>([])
  const [rfqQuery, setRfqQuery] = useState('')

  // Bookings
  const [appointments, setAppointments] = useState<AppointmentRow[]>([])
  const [bookingQuery, setBookingQuery] = useState('')
  const [newSlot, setNewSlot] = useState({ date: '', startTime: '', endTime: '' })

  // Audit log
  const [auditLog, setAuditLog] = useState<AuditLogRow[]>([])
  const [auditQuery, setAuditQuery] = useState('')

  const loadOverview = async () => {
    const headers = await authed()
    const { data } = await api.get('/analytics/overview', { headers })
    setOverview(data)
  }
  const loadClients = async (q = '') => {
    const headers = await authed()
    const { data } = await api.get('/admin/users', { headers, params: { role: 'client', q: q || undefined } })
    setClients(data)
  }
  const loadServices = async () => {
    const headers = await authed()
    const { data } = await api.get('/services', { headers })
    setServices(data)
    const pairs = await Promise.all(
      data.map(async (s: Service) => {
        const res = await api.get(`/services/${s.id}/files`, { headers })
        return [s.id, res.data] as const
      }),
    )
    setServiceFiles(Object.fromEntries(pairs))
  }
  const loadRequests = async (q = '') => {
    const headers = await authed()
    const { data } = await api.get('/file-access-requests', { headers, params: { q: q || undefined } })
    setRequests(data)
  }
  const loadCandidates = async (q = '') => {
    const headers = await authed()
    const { data } = await api.get('/candidate-applications', { headers, params: { q: q || undefined } })
    setCandidates(data)
  }
  const loadRfqs = async (q = '') => {
    const headers = await authed()
    const { data } = await api.get('/rfqs', { headers, params: { q: q || undefined } })
    setRfqs(data)
  }
  const loadAppointments = async (q = '') => {
    const headers = await authed()
    const { data } = await api.get('/appointments', { headers, params: { q: q || undefined } })
    setAppointments(data)
  }
  const loadAuditLog = async (q = '') => {
    const headers = await authed()
    const { data } = await api.get('/audit-log', { headers, params: { q: q || undefined } })
    setAuditLog(data)
  }

  useEffect(() => {
    loadOverview()
    loadClients()
    loadServices()
    loadRequests()
    loadCandidates()
    loadRfqs()
    loadAppointments()
    loadAuditLog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleClientStatus = async (c: AdminUser) => {
    const headers = await authed()
    await api.patch(`/admin/users/${c.id}/${c.disabledAt ? 'enable' : 'disable'}`, {}, { headers })
    loadClients(clientQuery)
  }

  const uploadSpec = (serviceId: string) => fileInputRefs.current[serviceId]?.click()

  const handleFileSelected = async (serviceId: string, file: File) => {
    setUploadingId(serviceId)
    try {
      const headers = await authed()
      const { data: presign } = await api.post(`/services/${serviceId}/files/presign`, { filename: file.name, contentType: file.type || 'application/octet-stream' }, { headers })
      await fetch(presign.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
      await api.post(`/services/${serviceId}/files`, { s3Key: presign.key, originalFilename: file.name }, { headers })
      const { data: files } = await api.get(`/services/${serviceId}/files`, { headers })
      setServiceFiles((prev) => ({ ...prev, [serviceId]: files }))
    } finally {
      setUploadingId(null)
    }
  }

  const decideRequest = async (id: string, approve: boolean) => {
    const headers = await authed()
    await api.post(`/file-access-requests/${id}/decide`, { approve }, { headers })
    loadRequests(requestQuery)
    loadOverview()
  }

  const decideCandidate = async (id: string, approve: boolean) => {
    const headers = await authed()
    await api.patch(`/candidate-applications/${id}/decide`, { approve }, { headers })
    loadCandidates(candidateQuery)
  }

  const viewCandidateDocs = async (id: string) => {
    const headers = await authed()
    const { data } = await api.get(`/candidate-applications/${id}/documents`, { headers })
    window.open(data.idPhotoUrl, '_blank')
    window.open(data.cvUrl, '_blank')
  }

  const createSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSlot.date || !newSlot.startTime || !newSlot.endTime) return
    const headers = await authed()
    await api.post(
      '/appointments/slots',
      {
        date: new Date(newSlot.date).toISOString(),
        startTime: new Date(`${newSlot.date}T${newSlot.startTime}`).toISOString(),
        endTime: new Date(`${newSlot.date}T${newSlot.endTime}`).toISOString(),
      },
      { headers },
    )
    setNewSlot({ date: '', startTime: '', endTime: '' })
    loadAppointments(bookingQuery)
  }

  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, { bg: string; color: string }> = {
      pending: { bg: '#FEF3C7', color: '#92400E' },
      approved: { bg: '#DCFCE7', color: '#166534' },
      denied: { bg: '#FEE2E2', color: '#991B1B' },
      in_review: { bg: '#DBEAFE', color: '#1E40AF' },
      quoted: { bg: '#F3F4F6', color: '#374151' },
      closed: { bg: '#F1F5F9', color: '#475569' },
    }
    const s = map[status] ?? { bg: '#F1F5F9', color: '#475569' }
    const label = t.has(`status.${status}`) ? t(`status.${status}` as any) : status
    return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, background: s.bg, color: s.color, textTransform: 'capitalize' }}>{label}</span>
  }

  const ActionPair = ({ status, onApprove, onDeny }: { status: string; onApprove: () => void; onDeny: () => void }) => {
    if (status !== 'pending') return <StatusBadge status={status} />
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onApprove} style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: 9999, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>{t('approve')}</button>
        <button onClick={onDeny} style={{ background: '#991B1B', color: '#fff', border: 'none', borderRadius: 9999, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>{t('deny')}</button>
      </div>
    )
  }

  const tableHead = (cols: string[]) => (
    <thead>
      <tr>
        {cols.map((c) => (
          <th key={c} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: palette.muted, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>{c}</th>
        ))}
      </tr>
    </thead>
  )

  const SearchBox = ({ value, onChange, onSearch, placeholder }: { value: string; onChange: (v: string) => void; onSearch: () => void; placeholder: string }) => (
    <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSearch() }}
        placeholder={placeholder}
        style={{ flex: 1, maxWidth: 320, padding: '9px 14px', borderRadius: 9999, border: '1.5px solid #E2E8F0', fontSize: 13, fontFamily: 'Poppins, sans-serif', outline: 'none' }}
      />
      <button onClick={onSearch} style={{ padding: '9px 18px', borderRadius: 9999, border: 'none', background: '#4B5563', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
        {t('search')}
      </button>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'Poppins, sans-serif', background: '#F8FAFC' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, flexShrink: 0, background: palette.navy, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #1E293B' }}>
          <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 11 }}>USE</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{t('panelLabel')}</div>
              <div style={{ fontSize: 9, color: '#475569' }}>United Services Egypt</div>
            </div>
          </button>
        </div>
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setSection(n.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 9, border: 'none', background: section === n.id ? 'rgba(234,88,12,0.15)' : 'transparent', color: section === n.id ? palette.accent : '#64748B', fontWeight: section === n.id ? 600 : 400, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', textAlign: 'left', transition: 'background 0.15s' }}>
              <span style={{ fontSize: 14 }}>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '10px 8px', borderTop: '1px solid #1E293B' }}>
          <button onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 9, border: 'none', background: 'transparent', color: '#EF4444', fontSize: 12, fontWeight: 500, cursor: 'pointer', width: '100%', fontFamily: 'Poppins, sans-serif' }}>
            {t('logOut')}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 64, background: '#fff', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px' }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: palette.navy }}>{NAV.find((n) => n.id === section)?.label ?? t('headerFallback')}</h1>
          <div style={{ fontSize: 11, color: palette.muted, letterSpacing: '0.1em' }}>{t('restrictedAccess')}</div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

          {/* OVERVIEW */}
          {section === 'overview' && overview && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
                {[
                  { label: t('overview.clients'), value: overview.clientCount, sub: t('overview.companiesSub', { count: overview.companyCount }) },
                  { label: t('overview.fileRequests'), value: overview.fileAccessRequested, sub: t('overview.approvedSub', { count: overview.fileAccessApproved }) },
                  { label: t('overview.rfqs'), value: overview.rfqCount, sub: t('overview.totalSubmitted') },
                  { label: t('overview.appointments'), value: overview.appointmentCount, sub: t('overview.totalBooked') },
                ].map((c) => (
                  <div key={c.label} style={{ background: '#fff', borderRadius: 16, padding: '20px 22px', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: 11, color: palette.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{c.label}</div>
                    <div style={{ fontSize: 36, fontWeight: 800, color: palette.accent, lineHeight: 1, marginBottom: 6 }}>{c.value}</div>
                    <div style={{ fontSize: 12, color: palette.muted }}>{c.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#fff', borderRadius: 16, padding: '24px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: palette.navy, marginBottom: 16 }}>{t('overview.recentActivity')}</div>
                {auditLog.slice(0, 6).map((a) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid #F1F5F9' }}>
                    <div style={{ flex: 1, fontSize: 13, color: palette.slate }}>
                      <strong>{a.actor.firstName} {a.actor.lastName}</strong> — {a.action.replace(/_/g, ' ').replace(/\./g, ' ')}
                    </div>
                    <div style={{ fontSize: 12, color: palette.muted }}>{fmtDateTime(a.createdAt)}</div>
                  </div>
                ))}
                {auditLog.length === 0 && <div style={{ fontSize: 13, color: palette.muted }}>{t('overview.noActivity')}</div>}
                <button onClick={() => setSection('audit')} style={{ marginTop: 12, background: 'none', border: 'none', color: palette.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                  {t('overview.viewFullLog')}
                </button>
              </div>
            </div>
          )}

          {/* CLIENTS */}
          {section === 'clients' && (
            <>
              <SearchBox value={clientQuery} onChange={setClientQuery} onSearch={() => loadClients(clientQuery)} placeholder={t('clients.searchPlaceholder')} />
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  {tableHead(t.raw('clients.cols'))}
                  <tbody>
                    {clients.map((c, i) => (
                      <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: palette.navy, fontWeight: 600 }}>{c.firstName} {c.lastName}</td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: palette.slate }}>{c.companyName ?? '—'}</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{c.email}</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{fmtDate(c.createdAt)}</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{c.mfaEnrolled ? t('yes') : t('no')}</td>
                        <td style={{ padding: '14px 16px' }}><StatusBadge status={c.disabledAt ? 'denied' : 'approved'} /></td>
                        <td style={{ padding: '14px 16px' }}>
                          <button onClick={() => toggleClientStatus(c)} style={{ background: c.disabledAt ? '#166534' : '#991B1B', color: '#fff', border: 'none', borderRadius: 9999, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                            {c.disabledAt ? t('clients.enable') : t('clients.disable')}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {clients.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', fontSize: 13, color: palette.muted }}>{t('clients.none')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* SPEC FILES */}
          {section === 'specs' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {services.map((svc) => {
                const files = serviceFiles[svc.id] ?? []
                const latest = files[0]
                return (
                  <div key={svc.id} style={{ background: '#fff', borderRadius: 16, padding: '22px', border: `1px solid ${latest ? palette.accent : '#E2E8F0'}` }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: palette.navy, marginBottom: 14 }}>{svc.name}</div>
                    {latest ? (
                      <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginBottom: 14 }}>✅ {latest.originalFilename} (v{latest.version})</div>
                    ) : (
                      <div style={{ fontSize: 12, color: palette.muted, marginBottom: 14 }}>{t('specs.noFile')}</div>
                    )}
                    <input
                      ref={(el) => { fileInputRefs.current[svc.id] = el }}
                      type="file"
                      style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(svc.id, f) }}
                    />
                    <button onClick={() => uploadSpec(svc.id)} disabled={uploadingId === svc.id} style={{ width: '100%', padding: '9px', background: latest ? '#F1F5F9' : palette.accent, color: latest ? palette.slate : '#fff', border: 'none', borderRadius: 9999, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                      {uploadingId === svc.id ? t('specs.uploading') : latest ? t('specs.replaceFile') : t('specs.uploadFile')}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* FILE REQUESTS */}
          {section === 'requests' && (
            <>
              <SearchBox value={requestQuery} onChange={setRequestQuery} onSearch={() => loadRequests(requestQuery)} placeholder={t('requests.searchPlaceholder')} />
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  {tableHead(t.raw('requests.cols'))}
                  <tbody>
                    {requests.map((r, i) => (
                      <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: palette.navy, fontWeight: 600 }}>{r.client.firstName} {r.client.lastName}</td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: palette.slate }}>{r.client.companyName ?? '—'}</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.accent, fontWeight: 600 }}>{r.serviceFile.originalFilename} ({r.serviceFile.service.name})</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{fmtDate(r.requestedAt)}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <ActionPair status={r.status} onApprove={() => decideRequest(r.id, true)} onDeny={() => decideRequest(r.id, false)} />
                        </td>
                      </tr>
                    ))}
                    {requests.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', fontSize: 13, color: palette.muted }}>{t('requests.none')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* CANDIDATES */}
          {section === 'candidates' && (
            <>
              <SearchBox value={candidateQuery} onChange={setCandidateQuery} onSearch={() => loadCandidates(candidateQuery)} placeholder={t('candidates.searchPlaceholder')} />
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  {tableHead(t.raw('candidates.cols'))}
                  <tbody>
                    {candidates.map((c, i) => (
                      <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: palette.navy, fontWeight: 600 }}>{c.candidateUser.firstName} {c.candidateUser.lastName}</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.slate }}>{c.position?.title ?? '—'}</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{c.candidateUser.email}</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{fmtDate(c.dateOfBirth)}</td>
                        <td style={{ padding: '14px 16px' }}>
                          <button onClick={() => viewCandidateDocs(c.id)} style={{ fontSize: 11, background: '#DBEAFE', color: '#1E40AF', borderRadius: 6, padding: '4px 10px', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                            {t('candidates.viewDocs')}
                          </button>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <ActionPair status={c.status} onApprove={() => decideCandidate(c.id, true)} onDeny={() => decideCandidate(c.id, false)} />
                        </td>
                      </tr>
                    ))}
                    {candidates.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', fontSize: 13, color: palette.muted }}>{t('candidates.none')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* RFQs */}
          {section === 'rfqs' && (
            <>
              <SearchBox value={rfqQuery} onChange={setRfqQuery} onSearch={() => loadRfqs(rfqQuery)} placeholder={t('rfqs.searchPlaceholder')} />
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  {tableHead(t.raw('rfqs.cols'))}
                  <tbody>
                    {rfqs.map((r, i) => (
                      <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: palette.navy, fontWeight: 600 }}>{r.client.firstName} {r.client.lastName}</td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: palette.slate }}>{r.client.companyName ?? '—'}</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.accent, fontWeight: 600 }}>{r.service?.name ?? t('rfqs.general')}</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{fmtDate(r.createdAt)}</td>
                        <td style={{ padding: '14px 16px' }}><StatusBadge status={r.status} /></td>
                      </tr>
                    ))}
                    {rfqs.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', fontSize: 13, color: palette.muted }}>{t('rfqs.none')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* BOOKINGS */}
          {section === 'bookings' && (
            <>
              <form onSubmit={createSlot} style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: 20, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: palette.navy, marginBottom: 6 }}>{t('bookings.date')}</label>
                  <input type="date" value={newSlot.date} onChange={(e) => setNewSlot((s) => ({ ...s, date: e.target.value }))} required style={{ padding: '9px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 13, fontFamily: 'Poppins, sans-serif' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: palette.navy, marginBottom: 6 }}>{t('bookings.startTime')}</label>
                  <input type="time" value={newSlot.startTime} onChange={(e) => setNewSlot((s) => ({ ...s, startTime: e.target.value }))} required style={{ padding: '9px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 13, fontFamily: 'Poppins, sans-serif' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: palette.navy, marginBottom: 6 }}>{t('bookings.endTime')}</label>
                  <input type="time" value={newSlot.endTime} onChange={(e) => setNewSlot((s) => ({ ...s, endTime: e.target.value }))} required style={{ padding: '9px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 13, fontFamily: 'Poppins, sans-serif' }} />
                </div>
                <button type="submit" style={{ padding: '10px 22px', borderRadius: 9999, border: 'none', background: palette.accent, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                  {t('bookings.addSlot')}
                </button>
              </form>

              <SearchBox value={bookingQuery} onChange={setBookingQuery} onSearch={() => loadAppointments(bookingQuery)} placeholder={t('bookings.searchPlaceholder')} />
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  {tableHead(t.raw('bookings.cols'))}
                  <tbody>
                    {appointments.map((b, i) => (
                      <tr key={b.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: palette.navy, fontWeight: 600 }}>{b.client.firstName} {b.client.lastName}</td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: palette.slate }}>{b.client.companyName ?? '—'}</td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: palette.navy }}>{fmtDate(b.slot.date)}</td>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: palette.slate }}>{fmtTime(b.slot.startTime)}–{fmtTime(b.slot.endTime)}</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{fmtDate(b.createdAt)}</td>
                      </tr>
                    ))}
                    {appointments.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', fontSize: 13, color: palette.muted }}>{t('bookings.none')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* AUDIT LOG */}
          {section === 'audit' && (
            <>
              <SearchBox value={auditQuery} onChange={setAuditQuery} onSearch={() => loadAuditLog(auditQuery)} placeholder={t('audit.searchPlaceholder')} />
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  {tableHead(t.raw('audit.cols'))}
                  <tbody>
                    {auditLog.map((a, i) => (
                      <tr key={a.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                        <td style={{ padding: '14px 16px', fontSize: 13, color: palette.navy, fontWeight: 600 }}>{a.actor.firstName} {a.actor.lastName} <span style={{ color: palette.muted, fontWeight: 400 }}>({a.actor.role})</span></td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.accent, fontWeight: 600 }}>{a.action}</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{a.targetType} · {a.targetId.slice(0, 8)}…</td>
                        <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{fmtDateTime(a.createdAt)}</td>
                      </tr>
                    ))}
                    {auditLog.length === 0 && <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', fontSize: 13, color: palette.muted }}>{t('audit.none')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* SECURITY */}
          {section === 'security' && <AdminSecuritySection />}
        </main>
      </div>
    </div>
  )
}
