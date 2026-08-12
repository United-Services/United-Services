'use client'
import { useState } from 'react'
import { palette, inputStyle } from '../theme'
const worldImg = 'https://images.unsplash.com/photo-1602860109208-613d39362844?w=1200&q=85'

interface Props {
  onNavigate: (page: string) => void
  onSignup: () => void
}

export default function ClientSignup({ onNavigate, onSignup }: Props) {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', company: '', password: '' })
  const [loading, setLoading] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => { setLoading(false); onSignup() }, 900)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', fontFamily: 'Poppins, sans-serif' }}>
      <div style={{ position: 'relative', overflow: 'hidden', background: '#111' }}>
        <img src={worldImg} alt="Industrial energy infrastructure" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${palette.accent}bb 0%, rgba(15,23,42,0.85) 100%)` }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 52 }}>
          <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 52 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: palette.accent, fontWeight: 800, fontSize: 13 }}>USE</div>
            <span style={{ fontWeight: 700, fontSize: 17, color: '#fff' }}>United Services Egypt</span>
          </button>
          <h2 style={{ fontSize: 36, fontWeight: 800, color: '#fff', lineHeight: 1.15, marginBottom: 20, letterSpacing: '-0.02em' }}>
            Access the full USE service portfolio.
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', lineHeight: 1.7, marginBottom: 40 }}>
            Register as a client to browse technical specifications, request spec file downloads, submit RFQs, and book engineering consultations.
          </p>
          {['✓ Browse all six service systems', '✓ Request certified spec file access', '✓ Submit RFQs and book site visits'].map((t) => (
            <div key={t} style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: 500, marginBottom: 12 }}>{t}</div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 64px', background: '#fff', overflowY: 'auto' }}>
        <div style={{ maxWidth: 420, width: '100%', margin: '0 auto' }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: palette.navy, marginBottom: 8, letterSpacing: '-0.02em' }}>Create Client Account</h1>
          <p style={{ fontSize: 14, color: palette.muted, marginBottom: 32 }}>All fields are required for account verification.</p>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>First Name</label>
                <input value={form.firstName} onChange={set('firstName')} placeholder="Your first name" required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>Last Name</label>
                <input value={form.lastName} onChange={set('lastName')} placeholder="Your last name" required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
            </div>

            {[
              { key: 'phone' as const, label: 'Phone Number', placeholder: 'Your direct contact phone number', type: 'tel' },
              { key: 'email' as const, label: 'Email Address', placeholder: 'Your work email address', type: 'email' },
              { key: 'company' as const, label: 'Company / Operator Name', placeholder: 'Full name of your organisation', type: 'text' },
              { key: 'password' as const, label: 'Password', placeholder: 'Create a strong password (8+ characters)', type: 'password' },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>{label}</label>
                <input type={type} value={form[key]} onChange={set(key)} placeholder={placeholder} required minLength={key === 'password' ? 8 : undefined} style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
            ))}

            <div style={{ marginBottom: 28 }} />
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: 9999, border: 'none', background: loading ? '#9CA3AF' : palette.accent, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              {loading ? 'Creating Account…' : 'Create Client Account'}
            </button>
            <p style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
              By registering you agree to USE's <span style={{ color: palette.accent, cursor: 'pointer' }}>Terms</span> and <span style={{ color: palette.accent, cursor: 'pointer' }}>Privacy Policy</span>. Account access is subject to verification.
            </p>
          </form>

          <div style={{ textAlign: 'center', marginTop: 20 }}>
            <span style={{ fontSize: 13, color: palette.muted }}>Already have an account? </span>
            <button onClick={() => onNavigate('client-login')} style={{ background: 'none', border: 'none', color: palette.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              Sign In
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
