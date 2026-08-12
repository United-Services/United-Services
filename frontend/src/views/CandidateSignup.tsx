'use client'
import { useState, useRef } from 'react'
import { palette, inputStyle } from '../theme'

interface Props { onNavigate: (page: string) => void }

export default function CandidateSignup({ onNavigate }: Props) {
  const [form, setForm] = useState({ firstName: '', lastName: '', dob: '', email: '', password: '' })
  const [idFile, setIdFile] = useState<File | null>(null)
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const idRef = useRef<HTMLInputElement>(null)
  const cvRef = useRef<HTMLInputElement>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!idFile || !cvFile) return
    setLoading(true)
    setTimeout(() => { setLoading(false); setSubmitted(true) }, 1200)
  }

  const UploadBox = ({ label, file, accept, onRef, onFile }: { label: string; file: File | null; accept: string; onRef: React.RefObject<HTMLInputElement | null>; onFile: (f: File) => void }) => (
    <div
      onClick={() => onRef.current?.click()}
      style={{ border: `2px dashed ${file ? palette.accent : '#E2E8F0'}`, borderRadius: 14, padding: '24px', cursor: 'pointer', textAlign: 'center', background: file ? '#FFF7ED' : '#F8FAFC', transition: 'border-color 0.2s, background 0.2s' }}
      onMouseEnter={(e) => { if (!file) (e.currentTarget as HTMLDivElement).style.borderColor = '#94A3B8' }}
      onMouseLeave={(e) => { if (!file) (e.currentTarget as HTMLDivElement).style.borderColor = '#E2E8F0' }}
    >
      <input ref={onRef} type="file" accept={accept} style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]) }} />
      <div style={{ fontSize: 28, marginBottom: 8 }}>{file ? '✅' : accept.includes('image') ? '🪪' : '📄'}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: file ? palette.accent : palette.navy, marginBottom: 4 }}>{file ? file.name : label}</div>
      <div style={{ fontSize: 11, color: palette.muted }}>{file ? 'Click to replace' : accept.includes('image') ? 'JPG / PNG, max 5 MB' : 'PDF or DOC, max 10 MB'}</div>
    </div>
  )

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', fontFamily: 'Poppins, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 520, width: '100%', background: '#fff', borderRadius: 24, padding: '64px 48px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, margin: '0 auto 24px' }}>⏳</div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: palette.navy, marginBottom: 12, letterSpacing: '-0.02em' }}>Application Submitted</h2>
          <p style={{ fontSize: 14, color: palette.muted, lineHeight: 1.8, marginBottom: 32 }}>
            Thank you, <strong>{form.firstName}</strong>. Your application is now in the USE review queue.<br />
            You will be notified at <strong>{form.email}</strong> once it has been assessed by our HR team.
          </p>
          <div style={{ background: '#F8FAFC', borderRadius: 14, padding: '20px 24px', marginBottom: 32, textAlign: 'left' }}>
            <div style={{ fontSize: 11, color: palette.accent, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 12 }}>WHAT HAPPENS NEXT</div>
            {['Your ID and CV are reviewed by USE HR within 5 business days.', 'Shortlisted candidates are contacted for a technical interview.', 'Successful candidates join the USE talent pipeline.'].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 10, alignItems: 'flex-start' }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 10, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 13, color: palette.slate, lineHeight: 1.5 }}>{s}</span>
              </div>
            ))}
          </div>
          <button onClick={() => onNavigate('home')} style={{ background: palette.accent, color: '#fff', border: 'none', borderRadius: 9999, padding: '12px 32px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
            Return to USE Website
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: 'Poppins, sans-serif', padding: '40px 24px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 36 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 12 }}>USE</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: palette.navy }}>United Services Egypt</span>
        </button>

        <div style={{ background: '#fff', borderRadius: 24, padding: '48px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: 11, color: palette.accent, fontWeight: 700, letterSpacing: '0.15em', marginBottom: 10 }}>USE · CAREERS APPLICATION</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: palette.navy, marginBottom: 8, letterSpacing: '-0.02em' }}>Candidate Registration</h1>
          <p style={{ fontSize: 14, color: palette.muted, marginBottom: 36, lineHeight: 1.6 }}>
            Complete your profile to join the USE talent pipeline. Your application will be reviewed by our HR team within 5 business days.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>First Name</label>
                <input value={form.firstName} onChange={set('firstName')} placeholder="Your first name" required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Last Name</label>
                <input value={form.lastName} onChange={set('lastName')} placeholder="Your last name" required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Date of Birth</label>
              <input type="date" value={form.dob} onChange={set('dob')} required style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Email Address</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="Your personal or work email" required style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Password</label>
              <input type="password" value={form.password} onChange={set('password')} placeholder="Create a password (8+ characters)" required minLength={8} style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
            </div>

            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 28, marginBottom: 28 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: palette.navy, marginBottom: 6 }}>Identity & CV Documents</div>
              <p style={{ fontSize: 13, color: palette.muted, marginBottom: 20 }}>Both documents are required for application review. Formats: JPG/PNG for ID, PDF or DOC for CV.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>National ID / Passport Photo</div>
                  <UploadBox label="Upload ID Photo" file={idFile} accept="image/*" onRef={idRef} onFile={(f) => setIdFile(f)} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Curriculum Vitae (CV)</div>
                  <UploadBox label="Upload CV" file={cvFile} accept=".pdf,.doc,.docx" onRef={cvRef} onFile={(f) => setCvFile(f)} />
                </div>
              </div>
            </div>

            {(!idFile || !cvFile) && (
              <p style={{ fontSize: 12, color: '#F59E0B', marginBottom: 16, fontWeight: 600 }}>
                ⚠ Please upload both your ID photo and CV to proceed.
              </p>
            )}

            <button type="submit" disabled={loading || !idFile || !cvFile} style={{ width: '100%', padding: '14px', borderRadius: 9999, border: 'none', background: loading || !idFile || !cvFile ? '#9CA3AF' : palette.accent, color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading || !idFile || !cvFile ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              {loading ? 'Submitting Application…' : 'Submit Application to USE HR'}
            </button>

            <p style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
              Your information is handled confidentially in accordance with USE's privacy policy and applicable data protection laws.
            </p>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button onClick={() => onNavigate('careers')} style={{ background: 'none', border: 'none', color: palette.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
            ← Back to Careers
          </button>
        </div>
      </div>
    </div>
  )
}
