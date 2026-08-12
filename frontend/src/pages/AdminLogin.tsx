import { useState } from 'react'
import { palette, inputStyle } from '../theme'

interface Props { onNavigate: (page: string) => void; onLogin: () => void }

export default function AdminLogin({ onNavigate, onLogin }: Props) {
  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => { setLoading(false); setStep(2) }, 900)
  }

  const handleStep2 = (e: React.FormEvent) => {
    e.preventDefault()
    const full = code.join('')
    if (full.length < 6) { setError('Enter the full 6-digit code.'); return }
    setLoading(true)
    setTimeout(() => { setLoading(false); onLogin() }, 900)
  }

  const handleBiometric = () => {
    setBiometricLoading(true)
    setTimeout(() => { setBiometricLoading(false); onLogin() }, 1800)
  }

  const setDigit = (i: number, v: string) => {
    if (!/^\d?$/.test(v)) return
    const next = [...code]
    next[i] = v
    setCode(next)
    setError('')
    if (v && i < 5) {
      const nextInput = document.getElementById(`mfa-${i + 1}`)
      if (nextInput) (nextInput as HTMLInputElement).focus()
    }
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      const prev = document.getElementById(`mfa-${i - 1}`)
      if (prev) (prev as HTMLInputElement).focus()
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: palette.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Poppins, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 440, width: '100%' }}>
        <button onClick={() => onNavigate('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13 }}>USE</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>United Services Egypt</div>
            <div style={{ fontSize: 10, color: '#475569', letterSpacing: '0.08em' }}>ADMIN ACCESS · RESTRICTED</div>
          </div>
        </button>

        <div style={{ background: '#1E293B', borderRadius: 24, padding: '48px', border: '1px solid #334155' }}>
          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
            {[1, 2].map((s) => (
              <div key={s} style={{ height: 3, flex: 1, borderRadius: 9999, background: step >= s ? palette.accent : '#334155', transition: 'background 0.3s' }} />
            ))}
          </div>

          {step === 1 ? (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 6, letterSpacing: '-0.02em' }}>Admin Sign In</h1>
              <p style={{ fontSize: 13, color: '#64748B', marginBottom: 32 }}>Step 1 of 2 — Credentials</p>
              <form onSubmit={handleStep1}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94A3B8', marginBottom: 8, letterSpacing: '0.06em' }}>EMAIL ADDRESS</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@use-eg.com" required
                    style={{ ...inputStyle, background: '#0F172A', border: '1.5px solid #334155', color: '#fff' }}
                    onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#334155' }} />
                </div>
                <div style={{ marginBottom: 32 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94A3B8', marginBottom: 8, letterSpacing: '0.06em' }}>PASSWORD</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your admin password" required
                    style={{ ...inputStyle, background: '#0F172A', border: '1.5px solid #334155', color: '#fff' }}
                    onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#334155' }} />
                </div>
                <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: 9999, border: 'none', background: loading ? '#475569' : palette.accent, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                  {loading ? 'Verifying…' : 'Continue to MFA →'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 6, letterSpacing: '-0.02em' }}>Multi-Factor Authentication</h1>
              <p style={{ fontSize: 13, color: '#64748B', marginBottom: 32 }}>Step 2 of 2 — Verify your identity</p>

              <form onSubmit={handleStep2}>
                <div style={{ marginBottom: 28 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94A3B8', marginBottom: 16, letterSpacing: '0.06em' }}>AUTHENTICATOR CODE</label>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
                    {code.map((d, i) => (
                      <input key={i} id={`mfa-${i}`} type="text" inputMode="numeric" maxLength={1} value={d} onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => handleKeyDown(i, e)}
                        style={{ width: 48, height: 56, borderRadius: 12, border: `2px solid ${d ? palette.accent : '#334155'}`, background: '#0F172A', color: '#fff', fontSize: 22, fontWeight: 700, textAlign: 'center', fontFamily: 'Poppins, sans-serif', outline: 'none', transition: 'border-color 0.2s' }} />
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: '#475569', textAlign: 'center' }}>Enter the 6-digit code from your authenticator app</p>
                  {error && <p style={{ fontSize: 12, color: '#EF4444', textAlign: 'center', marginTop: 8 }}>{error}</p>}
                </div>

                <button type="submit" disabled={loading || code.join('').length < 6} style={{ width: '100%', padding: '13px', borderRadius: 9999, border: 'none', background: code.join('').length < 6 ? '#334155' : palette.accent, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', marginBottom: 16 }}>
                  {loading ? 'Verifying Code…' : 'Verify and Sign In'}
                </button>
              </form>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: '#334155' }} />
                <span style={{ fontSize: 11, color: '#475569' }}>OR</span>
                <div style={{ flex: 1, height: 1, background: '#334155' }} />
              </div>

              <button onClick={handleBiometric} disabled={biometricLoading} style={{ width: '100%', padding: '13px', borderRadius: 9999, border: '1.5px solid #334155', background: 'transparent', color: biometricLoading ? '#475569' : '#94A3B8', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'border-color 0.2s, color 0.2s' }}
                onMouseEnter={(e) => { if (!biometricLoading) { (e.currentTarget as HTMLButtonElement).style.borderColor = '#64748B'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#334155'; (e.currentTarget as HTMLButtonElement).style.color = '#94A3B8' }}>
                <span style={{ fontSize: 18 }}>{biometricLoading ? '⏳' : '🔐'}</span>
                {biometricLoading ? 'Reading Biometric…' : 'Use Biometric / Device Auth'}
              </button>

              <button type="button" onClick={() => setStep(1)} style={{ display: 'block', margin: '20px auto 0', background: 'none', border: 'none', color: '#475569', fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                ← Back to credentials
              </button>
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button onClick={() => onNavigate('client-login')} style={{ background: 'none', border: 'none', color: '#475569', fontSize: 12, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
            Client Portal →
          </button>
        </div>
      </div>
    </div>
  )
}
