'use client'
import { useState } from 'react'
import { palette } from '../theme'

interface Props { onLogout: () => void; onNavigate: (page: string) => void }

type SpecStatus = 'none' | 'uploaded'
type RequestStatus = 'pending' | 'approved' | 'denied'

const SERVICES = ['GRE Tubular Lining', 'External Wrapping', 'Industrial Coating', 'HDPE Lining', 'RTP Systems', 'RTV Insulator Coating']
const TAGS = ['API 15CLT', 'ISO 21809', 'FBE / NACE', 'PE100 / ASTM', 'DN40–200', 'IEC 62073']

const MOCK_CLIENTS = [
  { id: 'C-001', name: 'Ahmed Khalil', company: 'Petrobel', email: 'a.khalil@petrobel.com.eg', joined: '2026-07-12', status: 'verified' },
  { id: 'C-002', name: 'Sara Naguib', company: 'Apache Egypt', email: 's.naguib@apacheeg.com', joined: '2026-07-20', status: 'verified' },
  { id: 'C-003', name: 'Omar Hassan', company: 'Khalda Petroleum', email: 'o.hassan@khalda.com', joined: '2026-08-01', status: 'pending' },
]

const MOCK_REQUESTS: { id: string; client: string; company: string; service: string; date: string }[] = [
  { id: 'REQ-001', client: 'Ahmed Khalil', company: 'Petrobel', service: 'GRE Tubular Lining', date: '2026-08-10' },
  { id: 'REQ-002', client: 'Sara Naguib', company: 'Apache Egypt', service: 'RTP Systems', date: '2026-08-11' },
  { id: 'REQ-003', client: 'Omar Hassan', company: 'Khalda Petroleum', service: 'External Wrapping', date: '2026-08-12' },
]

const MOCK_CANDIDATES = [
  { id: 'APP-001', name: 'Karim Saad', role: 'Senior Corrosion Engineer', email: 'k.saad@gmail.com', applied: '2026-08-05' },
  { id: 'APP-002', name: 'Noha Farouk', role: 'QC Inspector (NACE Level II)', email: 'n.farouk@outlook.com', applied: '2026-08-07' },
  { id: 'APP-003', name: 'Youssef Mansour', role: 'HSE Officer', email: 'y.mansour@yahoo.com', applied: '2026-08-09' },
]

const MOCK_RFQS = [
  { id: 'RFQ-001', client: 'Ahmed Khalil', company: 'Petrobel', service: 'GRE Tubular Lining', date: '2026-08-10', status: 'new' },
  { id: 'RFQ-002', client: 'Sara Naguib', company: 'Apache Egypt', service: 'RTP Systems', date: '2026-08-11', status: 'replied' },
]

const MOCK_BOOKINGS = [
  { id: 'BK-001', client: 'Omar Hassan', company: 'Khalda Petroleum', date: '2026-08-20', time: '10:00 – 11:00', status: 'confirmed' },
  { id: 'BK-002', client: 'Ahmed Khalil', company: 'Petrobel', date: '2026-08-22', time: '14:00 – 15:00', status: 'pending' },
]

const NAV = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'clients', label: 'Clients', icon: '👥' },
  { id: 'specs', label: 'Spec Files', icon: '📁' },
  { id: 'requests', label: 'File Requests', icon: '📋' },
  { id: 'candidates', label: 'Candidates', icon: '🎓' },
  { id: 'rfqs', label: 'RFQs', icon: '💼' },
  { id: 'bookings', label: 'Bookings', icon: '📅' },
]

export default function AdminDashboard({ onLogout, onNavigate }: Props) {
  const [section, setSection] = useState('overview')
  const [specStatus, setSpecStatus] = useState<Record<string, SpecSpec>>({})
  const [reqStatus, setReqStatus] = useState<Record<string, RequestStatus>>({})
  const [candStatus, setCandStatus] = useState<Record<string, RequestStatus>>({})

  interface SpecSpec { status: SpecStatus; filename?: string }

  const uploadSpec = (svc: string) => {
    setSpecStatus((p) => ({ ...p, [svc]: { status: 'uploaded', filename: `USE-SPEC-${svc.toUpperCase().replace(/\s+/g, '-')}.pdf` } }))
  }

  const setReq = (id: string, s: RequestStatus) => setReqStatus((p) => ({ ...p, [id]: s }))
  const setCand = (id: string, s: RequestStatus) => setCandStatus((p) => ({ ...p, [id]: s }))

  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, { bg: string; color: string }> = {
      pending: { bg: '#FEF3C7', color: '#92400E' },
      approved: { bg: '#DCFCE7', color: '#166534' },
      denied: { bg: '#FEE2E2', color: '#991B1B' },
      verified: { bg: '#DCFCE7', color: '#166534' },
      new: { bg: '#DBEAFE', color: '#1E40AF' },
      replied: { bg: '#F3F4F6', color: '#374151' },
      confirmed: { bg: '#DCFCE7', color: '#166534' },
    }
    const s = map[status] ?? { bg: '#F1F5F9', color: '#475569' }
    return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 9999, background: s.bg, color: s.color, textTransform: 'capitalize' }}>{status}</span>
  }

  const ActionPair = ({ id, current, onApprove, onDeny }: { id: string; current: RequestStatus | undefined; onApprove: () => void; onDeny: () => void }) => {
    if (current === 'approved') return <StatusBadge status="approved" />
    if (current === 'denied') return <StatusBadge status="denied" />
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={onApprove} style={{ background: '#166534', color: '#fff', border: 'none', borderRadius: 9999, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>Approve</button>
        <button onClick={onDeny} style={{ background: '#991B1B', color: '#fff', border: 'none', borderRadius: 9999, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>Deny</button>
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

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'Poppins, sans-serif', background: '#F8FAFC' }}>
      {/* Sidebar */}
      <aside style={{ width: 220, flexShrink: 0, background: palette.navy, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 64, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #1E293B' }}>
          <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 11 }}>USE</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Admin Panel</div>
              <div style={{ fontSize: 9, color: '#475569' }}>United Services Egypt</div>
            </div>
          </button>
        </div>
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setSection(n.id)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 9, border: 'none', background: section === n.id ? 'rgba(234,88,12,0.15)' : 'transparent', color: section === n.id ? palette.accent : '#64748B', fontWeight: section === n.id ? 600 : 400, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', textAlign: 'left', transition: 'background 0.15s' }}>
              <span style={{ fontSize: 14 }}>{n.icon}</span>{n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '10px 8px', borderTop: '1px solid #1E293B' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#1E293B', borderRadius: 9, marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 11, flexShrink: 0 }}>SY</div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>System Admin</div>
              <div style={{ fontSize: 10, color: '#475569' }}>use-eg.com</div>
            </div>
          </div>
          <button onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 9, border: 'none', background: 'transparent', color: '#EF4444', fontSize: 12, fontWeight: 500, cursor: 'pointer', width: '100%', fontFamily: 'Poppins, sans-serif' }}>
            🚪 Log Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 64, background: '#fff', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px' }}>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: palette.navy }}>{NAV.find((n) => n.id === section)?.label ?? 'Dashboard'}</h1>
          <div style={{ fontSize: 11, color: palette.muted, letterSpacing: '0.1em' }}>USE · ADMIN · RESTRICTED ACCESS</div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

          {/* OVERVIEW */}
          {section === 'overview' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
                {[
                  { label: 'Total Clients', value: MOCK_CLIENTS.length, sub: '1 pending verification', color: '#3B82F6' },
                  { label: 'Spec Requests', value: MOCK_REQUESTS.length, sub: `${Object.values(reqStatus).filter((s) => s === 'pending').length} awaiting action`, color: '#F59E0B' },
                  { label: 'Candidates', value: MOCK_CANDIDATES.length, sub: 'Applications in queue', color: palette.accent },
                  { label: 'Open RFQs', value: MOCK_RFQS.filter((r) => r.status === 'new').length, sub: 'Require engineering reply', color: '#8B5CF6' },
                ].map((c) => (
                  <div key={c.label} style={{ background: '#fff', borderRadius: 16, padding: '20px 22px', border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: 11, color: palette.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{c.label}</div>
                    <div style={{ fontSize: 36, fontWeight: 800, color: c.color, lineHeight: 1, marginBottom: 6 }}>{c.value}</div>
                    <div style={{ fontSize: 12, color: palette.muted }}>{c.sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#fff', borderRadius: 16, padding: '24px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: palette.navy, marginBottom: 16 }}>Recent Activity</div>
                {[
                  { icon: '📋', text: 'Omar Hassan requested the External Wrapping spec file', time: '2h ago' },
                  { icon: '🎓', text: 'Youssef Mansour applied for HSE Officer', time: '8h ago' },
                  { icon: '💼', text: 'Sara Naguib submitted an RFQ for RTP Systems', time: '1d ago' },
                  { icon: '👤', text: 'Omar Hassan created a new client account', time: '2d ago' },
                ].map((a, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < 3 ? '1px solid #F1F5F9' : 'none' }}>
                    <span style={{ fontSize: 20 }}>{a.icon}</span>
                    <div style={{ flex: 1, fontSize: 13, color: palette.slate }}>{a.text}</div>
                    <div style={{ fontSize: 12, color: palette.muted }}>{a.time}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CLIENTS */}
          {section === 'clients' && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {tableHead(['ID', 'Name', 'Company', 'Email', 'Joined', 'Status'])}
                <tbody>
                  {MOCK_CLIENTS.map((c, i) => (
                    <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted, fontWeight: 600 }}>{c.id}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: palette.navy, fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: palette.slate }}>{c.company}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{c.email}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{c.joined}</td>
                      <td style={{ padding: '14px 16px' }}><StatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* SPEC FILES */}
          {section === 'specs' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {SERVICES.map((svc, i) => {
                const spec = specStatus[svc]
                return (
                  <div key={svc} style={{ background: '#fff', borderRadius: 16, padding: '22px', border: `1px solid ${spec?.status === 'uploaded' ? palette.accent : '#E2E8F0'}` }}>
                    <div style={{ fontSize: 10, color: palette.accent, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 6 }}>SVC-0{i + 1} · {TAGS[i]}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: palette.navy, marginBottom: 14 }}>{svc}</div>
                    {spec?.status === 'uploaded' ? (
                      <>
                        <div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginBottom: 14 }}>✅ {spec.filename}</div>
                        <button onClick={() => uploadSpec(svc)} style={{ width: '100%', padding: '8px', background: '#F1F5F9', color: palette.slate, border: 'none', borderRadius: 9999, fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                          Replace File
                        </button>
                      </>
                    ) : (
                      <button onClick={() => uploadSpec(svc)} style={{ width: '100%', padding: '9px', background: palette.accent, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                        Upload Spec File
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* FILE REQUESTS */}
          {section === 'requests' && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {tableHead(['Request ID', 'Client', 'Company', 'Service', 'Date', 'Action'])}
                <tbody>
                  {MOCK_REQUESTS.map((r, i) => (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted, fontWeight: 600 }}>{r.id}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: palette.navy, fontWeight: 600 }}>{r.client}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: palette.slate }}>{r.company}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.accent, fontWeight: 600 }}>{r.service}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{r.date}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <ActionPair id={r.id} current={reqStatus[r.id]} onApprove={() => setReq(r.id, 'approved')} onDeny={() => setReq(r.id, 'denied')} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* CANDIDATES */}
          {section === 'candidates' && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {tableHead(['App ID', 'Name', 'Role Applied', 'Email', 'Applied', 'Documents', 'Decision'])}
                <tbody>
                  {MOCK_CANDIDATES.map((c, i) => (
                    <tr key={c.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted, fontWeight: 600 }}>{c.id}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: palette.navy, fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.slate }}>{c.role}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{c.email}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{c.applied}</td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <span style={{ fontSize: 11, background: '#DBEAFE', color: '#1E40AF', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>ID</span>
                          <span style={{ fontSize: 11, background: '#F3E8FF', color: '#6B21A8', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>CV</span>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <ActionPair id={c.id} current={candStatus[c.id]} onApprove={() => setCand(c.id, 'approved')} onDeny={() => setCand(c.id, 'denied')} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* RFQs */}
          {section === 'rfqs' && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {tableHead(['RFQ ID', 'Client', 'Company', 'Service', 'Date', 'Status'])}
                <tbody>
                  {MOCK_RFQS.map((r, i) => (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted, fontWeight: 600 }}>{r.id}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: palette.navy, fontWeight: 600 }}>{r.client}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: palette.slate }}>{r.company}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.accent, fontWeight: 600 }}>{r.service}</td>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted }}>{r.date}</td>
                      <td style={{ padding: '14px 16px' }}><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* BOOKINGS */}
          {section === 'bookings' && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                {tableHead(['Booking ID', 'Client', 'Company', 'Date', 'Time', 'Status'])}
                <tbody>
                  {MOCK_BOOKINGS.map((b, i) => (
                    <tr key={b.id} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                      <td style={{ padding: '14px 16px', fontSize: 12, color: palette.muted, fontWeight: 600 }}>{b.id}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: palette.navy, fontWeight: 600 }}>{b.client}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: palette.slate }}>{b.company}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: palette.navy }}>{b.date}</td>
                      <td style={{ padding: '14px 16px', fontSize: 13, color: palette.slate }}>{b.time}</td>
                      <td style={{ padding: '14px 16px' }}><StatusBadge status={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
