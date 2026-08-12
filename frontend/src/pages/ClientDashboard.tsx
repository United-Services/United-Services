import { useState } from 'react'
import { palette, inputStyle } from '../theme'
import greApplicationImg from '../imports/bp-valves.jpg'
import insulatorImg from '../imports/lux-power.jpg'

const SVC_IMGS = {
  svc01: greApplicationImg as unknown as string,
  svc02: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=600&q=80',
  svc03: 'https://images.unsplash.com/photo-1678984239420-43cdc183bce6?w=600&q=80',
  svc04: 'https://images.unsplash.com/photo-1684667273934-e5d39307eeae?w=600&q=80',
  svc05: 'https://images.unsplash.com/photo-1758965364875-e090e5423d2d?w=600&q=80',
}

interface Props { onLogout: () => void; onNavigate: (page: string) => void }

type SpecStatus = 'none' | 'pending' | 'approved'

const SERVICES = [
  { id: 'SVC-01', name: 'GRE Tubular Lining', tag: 'API 15CLT', img: SVC_IMGS.svc01 },
  { id: 'SVC-02', name: 'External Wrapping', tag: 'ISO 21809', img: SVC_IMGS.svc02 },
  { id: 'SVC-03', name: 'Industrial Coating', tag: 'FBE / NACE', img: SVC_IMGS.svc03 },
  { id: 'SVC-04', name: 'HDPE Lining', tag: 'PE100 / ASTM', img: SVC_IMGS.svc04 },
  { id: 'SVC-05', name: 'RTP Systems', tag: 'DN40–200', img: SVC_IMGS.svc05 },
  { id: 'SVC-06', name: 'RTV Insulator Coating', tag: 'IEC 62073', img: insulatorImg as unknown as string },
]

const NAV_ITEMS = [
  { id: 'services', label: 'Services', icon: '⚙️' },
  { id: 'rfq', label: 'Request for Quotation', icon: '📋' },
  { id: 'appointments', label: 'Book Appointment', icon: '📅' },
  { id: 'profile', label: 'My Profile', icon: '👤' },
]

export default function ClientDashboard({ onLogout, onNavigate }: Props) {
  const [section, setSection] = useState('services')
  const [specStatus, setSpecStatus] = useState<Record<string, SpecStatus>>({})
  const [rfq, setRfq] = useState({ service: '', description: '', timeline: '', message: '' })
  const [rfqSent, setRfqSent] = useState(false)
  const [appt, setAppt] = useState({ date: '', time: '', notes: '' })
  const [apptSent, setApptSent] = useState(false)

  const requestSpec = (id: string) => {
    setSpecStatus((prev) => ({ ...prev, [id]: 'pending' }))
    // Simulate admin approval after 3s for demo
    setTimeout(() => setSpecStatus((prev) => ({ ...prev, [id]: 'approved' })), 3000)
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'Poppins, sans-serif', background: '#F8FAFC' }}>
      {/* Sidebar */}
      <aside style={{ width: 240, flexShrink: 0, background: palette.navy, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: 68, display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid #1E293B' }}>
          <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 12 }}>USE</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Client Portal</div>
              <div style={{ fontSize: 10, color: '#475569' }}>United Services Egypt</div>
            </div>
          </button>
        </div>
        <nav style={{ flex: 1, padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV_ITEMS.map((n) => (
            <button key={n.id} onClick={() => setSection(n.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: 'none', background: section === n.id ? 'rgba(234,88,12,0.15)' : 'transparent', color: section === n.id ? palette.accent : '#64748B', fontWeight: section === n.id ? 600 : 400, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', textAlign: 'left', transition: 'background 0.15s' }}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding: '12px 10px', borderTop: '1px solid #1E293B' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 4, background: '#1E293B', borderRadius: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>A</div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Ahmed Khalil</div>
              <div style={{ fontSize: 11, color: '#475569' }}>Petrobel</div>
            </div>
          </div>
          <button onClick={onLogout} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 10, border: 'none', background: 'transparent', color: '#EF4444', fontSize: 13, fontWeight: 500, cursor: 'pointer', width: '100%', fontFamily: 'Poppins, sans-serif' }}>
            🚪 Log Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 68, background: '#fff', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', padding: '0 32px' }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: palette.navy }}>
            {NAV_ITEMS.find((n) => n.id === section)?.label ?? 'Portal'}
          </h1>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          {/* ── SERVICES ── */}
          {section === 'services' && (
            <div>
              <p style={{ fontSize: 14, color: palette.muted, marginBottom: 28 }}>
                Browse our six service systems. Request access to download certified specification files. Approved requests unlock the download immediately.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                {SERVICES.map((s) => {
                  const status = specStatus[s.id] ?? 'none'
                  return (
                    <div key={s.id} style={{ background: '#fff', borderRadius: 18, border: '1px solid #E2E8F0', overflow: 'hidden', transition: 'box-shadow 0.2s' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.07)' }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}>
                      <img src={s.img} alt={s.name} style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} />
                      <div style={{ padding: '18px 18px' }}>
                        <div style={{ fontSize: 10, color: palette.accent, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 6 }}>{s.id} · {s.tag}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: palette.navy, marginBottom: 14 }}>{s.name}</div>
                        {status === 'none' && (
                          <button onClick={() => requestSpec(s.id)} style={{ width: '100%', padding: '9px', background: '#4B5563', color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                            Request Spec File
                          </button>
                        )}
                        {status === 'pending' && (
                          <div style={{ textAlign: 'center', fontSize: 12, color: '#F59E0B', fontWeight: 600, padding: '9px', background: '#FFFBEB', borderRadius: 9999, border: '1px solid #FCD34D' }}>
                            ⏳ Awaiting Admin Approval
                          </div>
                        )}
                        {status === 'approved' && (
                          <button style={{ width: '100%', padding: '9px', background: palette.accent, color: '#fff', border: 'none', borderRadius: 9999, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                            ⬇ Download Spec File
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── RFQ ── */}
          {section === 'rfq' && (
            <div style={{ maxWidth: 640 }}>
              {rfqSent ? (
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 20, padding: '48px', textAlign: 'center' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: '#166534', marginBottom: 10 }}>RFQ Submitted</h2>
                  <p style={{ fontSize: 14, color: '#15803D', lineHeight: 1.7 }}>A USE engineer will review your request and respond within two business days.</p>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); setRfqSent(true) }} style={{ background: '#fff', borderRadius: 20, padding: '36px', border: '1px solid #E2E8F0' }}>
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Service Required</label>
                    <select value={rfq.service} onChange={(e) => setRfq((f) => ({ ...f, service: e.target.value }))} required style={{ ...inputStyle, appearance: 'none' }}
                      onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = palette.accent }} onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = '#E2E8F0' }}>
                      <option value="">Select the service you need</option>
                      {SERVICES.map((s) => <option key={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Project Description</label>
                    <textarea value={rfq.description} onChange={(e) => setRfq((f) => ({ ...f, description: e.target.value }))} placeholder="Describe your pipeline system, diameter, length, operating medium, pressure, and temperature" required rows={4} style={{ ...inputStyle, resize: 'vertical' }}
                      onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = palette.accent }} onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = '#E2E8F0' }} />
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Required Timeline</label>
                    <input value={rfq.timeline} onChange={(e) => setRfq((f) => ({ ...f, timeline: e.target.value }))} placeholder="e.g. Mobilization required within 6 weeks" style={inputStyle}
                      onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
                  </div>
                  <div style={{ marginBottom: 28 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Additional Notes</label>
                    <textarea value={rfq.message} onChange={(e) => setRfq((f) => ({ ...f, message: e.target.value }))} placeholder="Any specific standards, certifications, or access constraints to note" rows={3} style={{ ...inputStyle, resize: 'vertical' }}
                      onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = palette.accent }} onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = '#E2E8F0' }} />
                  </div>
                  <button type="submit" style={{ width: '100%', padding: '13px', borderRadius: 9999, border: 'none', background: palette.accent, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                    Submit RFQ to USE Engineering
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ── APPOINTMENTS ── */}
          {section === 'appointments' && (
            <div style={{ maxWidth: 540 }}>
              {apptSent ? (
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 20, padding: '48px', textAlign: 'center' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
                  <h2 style={{ fontSize: 22, fontWeight: 800, color: '#166534', marginBottom: 10 }}>Appointment Requested</h2>
                  <p style={{ fontSize: 14, color: '#15803D', lineHeight: 1.7 }}>USE will confirm your visit within 24 hours. You'll receive a confirmation at your registered email address.</p>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); setApptSent(true) }} style={{ background: '#fff', borderRadius: 20, padding: '36px', border: '1px solid #E2E8F0' }}>
                  <p style={{ fontSize: 14, color: palette.muted, marginBottom: 28 }}>
                    Book an office visit to the USE facility in Cairo to meet our engineering team, tour our manufacturing lines, or discuss your project.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Preferred Date</label>
                      <input type="date" value={appt.date} onChange={(e) => setAppt((f) => ({ ...f, date: e.target.value }))} required style={inputStyle}
                        onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Preferred Time</label>
                      <select value={appt.time} onChange={(e) => setAppt((f) => ({ ...f, time: e.target.value }))} required style={{ ...inputStyle, appearance: 'none' }}
                        onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = palette.accent }} onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = '#E2E8F0' }}>
                        <option value="">Select a time slot</option>
                        {['09:00', '10:00', '11:00', '13:00', '14:00', '15:00'].map((t) => <option key={t}>{t} – {(parseInt(t) + 1).toString().padStart(2, '0')}:00</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: 28 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Visit Purpose / Notes</label>
                    <textarea value={appt.notes} onChange={(e) => setAppt((f) => ({ ...f, notes: e.target.value }))} placeholder="Brief description of the purpose of your visit and who will be attending" rows={3} style={{ ...inputStyle, resize: 'vertical' }}
                      onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = palette.accent }} onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = '#E2E8F0' }} />
                  </div>
                  <button type="submit" style={{ width: '100%', padding: '13px', borderRadius: 9999, border: 'none', background: '#4B5563', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                    Request Appointment
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ── PROFILE ── */}
          {section === 'profile' && (
            <div style={{ maxWidth: 480 }}>
              <div style={{ background: '#fff', borderRadius: 20, padding: '32px', border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 20 }}>A</div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: palette.navy }}>Ahmed Khalil</div>
                    <div style={{ fontSize: 13, color: palette.muted }}>Senior Pipeline Engineer · Petrobel</div>
                  </div>
                </div>
                {[['Email', 'ahmed.khalil@petrobel.com.eg'], ['Company', 'Petrobel'], ['Phone', '+20 2 1234 5678'], ['Account Type', 'Client'], ['Status', 'Verified ✓']].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #F1F5F9' }}>
                    <span style={{ fontSize: 13, color: palette.muted, fontWeight: 500 }}>{k}</span>
                    <span style={{ fontSize: 13, color: palette.navy, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
