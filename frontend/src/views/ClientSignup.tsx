'use client'
import { useState } from 'react'
import { useSignUp } from '@clerk/nextjs'
import { palette, inputStyle } from '../theme'
const worldImg = 'https://images.unsplash.com/photo-1602860109208-613d39362844?w=1200&q=85'

interface Props {
  onNavigate: (page: string) => void
  onSignup: () => void
}

export default function ClientSignup({ onNavigate, onSignup }: Props) {
  const { signUp } = useSignUp()
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', company: '', password: '' })
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'form' | 'verify'>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      // companyName/phone ride along as unsafeMetadata (client-settable, but
      // never privilege-sensitive) — the webhook copies them onto our User
      // row. Role is never derived from this field, only ever from
      // server-set publicMetadata. See docs/BUSINESS_RULES.md.
      const { error: createError } = await signUp.password({
        emailAddress: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        unsafeMetadata: { companyName: form.company, phone: form.phone },
      })
      if (createError) {
        setError(createError.message ?? 'Could not create your account. Please check your details and try again.')
        return
      }
      const { error: codeError } = await signUp.verifications.sendEmailCode()
      if (codeError) {
        setError(codeError.message ?? 'Could not send a verification code. Please try again.')
        return
      }
      setStep('verify')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error: verifyError } = await signUp.verifications.verifyEmailCode({ code })
      if (verifyError) {
        setError(verifyError.message ?? 'Invalid verification code. Please try again.')
        return
      }
      const { error: finalizeError } = await signUp.finalize()
      if (finalizeError) {
        setError(finalizeError.message ?? 'Could not complete sign-up. Please try again.')
        return
      }
      onSignup()
    } finally {
      setLoading(false)
    }
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
          {step === 'form' ? (
            <>
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
                  { key: 'phone' as const, label: 'Phone Number', placeholder: 'Your direct contact phone number', type: 'tel', autoComplete: 'tel' },
                  { key: 'email' as const, label: 'Email Address', placeholder: 'Your work email address', type: 'email', autoComplete: 'email' },
                  { key: 'company' as const, label: 'Company / Operator Name', placeholder: 'Full name of your organisation', type: 'text', autoComplete: 'organization' },
                  { key: 'password' as const, label: 'Password', placeholder: 'Create a strong password (8+ characters)', type: 'password', autoComplete: 'new-password' },
                ].map(({ key, label, placeholder, type, autoComplete }) => (
                  <div key={key} style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>{label}</label>
                    <input type={type} autoComplete={autoComplete} value={form[key]} onChange={set(key)} placeholder={placeholder} required minLength={key === 'password' ? 8 : undefined} style={inputStyle}
                      onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
                  </div>
                ))}

                {error && <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 14 }}>{error}</p>}

                <div style={{ marginBottom: 14 }} />
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
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 26, fontWeight: 800, color: palette.navy, marginBottom: 8, letterSpacing: '-0.02em' }}>Verify Your Email</h1>
              <p style={{ fontSize: 14, color: palette.muted, marginBottom: 32 }}>Enter the 6-digit code we sent to {form.email}.</p>
              <form onSubmit={handleVerify}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>Verification Code</label>
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" required autoComplete="one-time-code" style={inputStyle}
                    onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
                </div>
                {error && <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 14 }}>{error}</p>}
                <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: 9999, border: 'none', background: loading ? '#9CA3AF' : palette.accent, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                  {loading ? 'Verifying…' : 'Verify & Continue'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
