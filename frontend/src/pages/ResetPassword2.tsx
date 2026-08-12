import { useState } from 'react'
import { palette, inputStyle } from '../theme'

interface Props { onNavigate: (page: string) => void }

export default function ResetPassword2({ onNavigate }: Props) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setError('')
    setLoading(true)
    setTimeout(() => { setLoading(false); setDone(true) }, 900)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', fontFamily: 'Poppins, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 40 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 12 }}>USE</div>
          <span style={{ fontWeight: 700, fontSize: 15, color: palette.navy }}>United Services Egypt</span>
        </button>

        {done ? (
          <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 20, padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#166534', marginBottom: 12 }}>Password Updated</h2>
            <p style={{ fontSize: 14, color: '#15803D', lineHeight: 1.7, marginBottom: 28 }}>Your password has been reset. You can now sign in to the Client Portal.</p>
            <button onClick={() => onNavigate('client-login')} style={{ background: palette.accent, color: '#fff', border: 'none', borderRadius: 9999, padding: '12px 32px', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              Sign In
            </button>
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 20, padding: '48px', border: '1px solid #E2E8F0' }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: palette.navy, marginBottom: 8, letterSpacing: '-0.02em' }}>Set New Password</h1>
            <p style={{ fontSize: 14, color: palette.muted, marginBottom: 32 }}>Step 2 of 2 — Choose a new password for your account</p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>New Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
              <div style={{ marginBottom: error ? 12 : 28 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Confirm Password</label>
                <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter your new password" required minLength={8} style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
              {error && <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 20 }}>{error}</p>}
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: 9999, border: 'none', background: loading ? '#9CA3AF' : palette.accent, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                {loading ? 'Updating Password…' : 'Update Password'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
