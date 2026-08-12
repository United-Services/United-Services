import { useState } from 'react'
import { palette, inputStyle } from '../theme'
const heroImg = 'https://images.unsplash.com/photo-1694674818352-f6061a0561a1?w=1200&q=85'

interface Props { onNavigate: (page: string) => void; onNext: () => void }

export default function ResetPassword1({ onNavigate, onNext }: Props) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => { setLoading(false); onNext() }, 900)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', fontFamily: 'Poppins, sans-serif' }}>
      <div style={{ position: 'relative', overflow: 'hidden', background: '#111' }}>
        <img src={heroImg} alt="USE pipeline facility" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.6 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(15,23,42,0.7) 0%, rgba(15,23,42,0.95) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 52 }}>
          <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 60 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13 }}>USE</div>
            <span style={{ fontWeight: 700, fontSize: 17, color: '#fff' }}>United Services Egypt</span>
          </button>
          <div style={{ fontSize: 48, marginBottom: 24 }}>🔑</div>
          <h2 style={{ fontSize: 32, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 16 }}>Reset your password</h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7 }}>Enter the email address associated with your USE Client Portal account. We"ll send you a reset link.</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 64px', background: '#fff' }}>
        <div style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: palette.navy, marginBottom: 8, letterSpacing: '-0.02em' }}>Forgot Password</h1>
          <p style={{ fontSize: 14, color: palette.muted, marginBottom: 36 }}>Step 1 of 2 — Enter your email address</p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Registered Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="The email address on your account" required style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: 9999, border: 'none', background: loading ? '#9CA3AF' : palette.accent, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              {loading ? 'Sending Reset Link…' : 'Send Reset Link'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button onClick={() => onNavigate('client-login')} style={{ background: 'none', border: 'none', color: palette.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
