import { useState } from 'react'
import { palette, inputStyle } from '../theme'
const heroImg = 'https://images.unsplash.com/photo-1586057285471-2f78bffaf074?w=1200&q=85'

interface Props {
  onNavigate: (page: string) => void
  onLogin: () => void
}

export default function ClientLogin({ onNavigate, onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => { setLoading(false); onLogin() }, 900)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', fontFamily: 'Poppins, sans-serif' }}>
      <div style={{ position: 'relative', overflow: 'hidden', background: '#111' }}>
        <img src={heroImg} alt="USE pipeline facility" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.75 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.3) 60%, transparent 100%)' }} />
        <button onClick={() => onNavigate('home')} style={{ position: 'absolute', top: 32, left: 32, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13 }}>USE</div>
          <span style={{ fontWeight: 700, fontSize: 17, color: '#fff' }}>United Services Egypt</span>
        </button>
        <div style={{ position: 'absolute', bottom: 48, left: 40, right: 40 }}>
          <div style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 20, padding: '28px' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 12 }}>USE · CLIENT PORTAL</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#fff', lineHeight: 1.6 }}>Access your service specifications, submit RFQs, and track your corrosion-control projects.</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 64px', background: '#fff' }}>
        <div style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
          <div style={{ marginBottom: 36 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: palette.navy, marginBottom: 8, letterSpacing: '-0.02em' }}>Client Portal Sign In</h1>
            <p style={{ fontSize: 14, color: palette.muted }}>Access your United Services Egypt account</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your registered email address" required style={inputStyle}
                onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <input type={showPwd ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your account password" required style={{ ...inputStyle, paddingRight: 48 }}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
                <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94A3B8', padding: 0 }}>
                  {showPwd ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
              <button type="button" onClick={() => onNavigate('reset1')} style={{ background: 'none', border: 'none', color: palette.accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                Forgot Password?
              </button>
            </div>
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: 9999, border: 'none', background: loading ? '#9CA3AF' : '#4B5563', color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'background 0.2s' }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#374151' }}
              onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#4B5563' }}>
              {loading ? 'Signing in…' : 'Sign In to Portal'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <span style={{ fontSize: 13, color: palette.muted }}>New to United Services? </span>
            <button onClick={() => onNavigate('client-signup')} style={{ background: 'none', border: 'none', color: palette.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              Create Account
            </button>
          </div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button onClick={() => onNavigate('admin-login')} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 12, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              Admin Login →
            </button>
          </div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 12, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              ← Back to site
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
