'use client'
import { useEffect, useState } from 'react'
import { useSignUp } from '@clerk/nextjs'
import { palette, inputStyle } from '../theme'
const worldImg = 'https://images.unsplash.com/photo-1602860109208-613d39362844?w=1200&q=85'

interface Props {
  onNavigate: (page: string) => void
  onSignup: () => void
}

const TOTAL_STEPS = 8

const STEP_TITLES: Record<number, string> = {
  1: 'First Name',
  2: 'Last Name',
  3: 'Phone Number',
  4: 'Company / Operator',
  5: 'Email Address',
  6: 'Create Password',
  7: 'Confirm Password',
  8: 'Verify Your Email',
}

export default function ClientSignup({ onNavigate, onSignup }: Props) {
  const { signUp } = useSignUp()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', company: '', email: '', password: '', confirmPassword: '' })
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (!success) return
    const t = setTimeout(() => onSignup(), 3000)
    return () => clearTimeout(t)
  }, [success, onSignup])

  const passwordChecks = [
    { label: 'At least 8 characters', valid: form.password.length >= 8 },
    { label: 'At least 1 uppercase letter', valid: /[A-Z]/.test(form.password) },
    { label: 'At least 1 number', valid: /[0-9]/.test(form.password) },
    { label: 'At least 1 symbol', valid: /[^A-Za-z0-9]/.test(form.password) },
  ]
  const passwordValid = passwordChecks.every((c) => c.valid)

  const goNext = () => {
    setError(null)
    setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  }
  const goBack = () => {
    setError(null)
    setStep((s) => Math.max(s - 1, 1))
  }

  const handleStepSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (step === 6 && !passwordValid) {
      setError('Please meet all password requirements to continue.')
      return
    }
    if (step === 7) {
      if (form.confirmPassword !== form.password) {
        setError('Passwords do not match.')
        return
      }
      setLoading(true)
      setError(null)
      try {
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
        goNext()
      } finally {
        setLoading(false)
      }
      return
    }
    if (step === 8) {
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
        setSuccess(true)
      } finally {
        setLoading(false)
      }
      return
    }

    goNext()
  }

  if (success) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', fontFamily: 'Poppins, sans-serif', padding: 24 }}>
        <div className="step-slide" style={{ maxWidth: 480, width: '100%', background: '#fff', borderRadius: 24, padding: '64px 48px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, margin: '0 auto 24px', color: '#16A34A' }}>✓</div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: palette.navy, marginBottom: 12, letterSpacing: '-0.02em' }}>Account Created</h2>
          <p style={{ fontSize: 14, color: palette.muted, lineHeight: 1.8 }}>
            Welcome, <strong>{form.firstName}</strong>. Redirecting you to your client dashboard…
          </p>
        </div>
      </div>
    )
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

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '60px 48px', background: '#fff', overflowY: 'auto' }}>
        <div style={{ maxWidth: 420, width: '100%', margin: '0 auto' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: palette.navy, marginBottom: 4, letterSpacing: '-0.02em' }}>Create Client Account</h1>
          <p style={{ fontSize: 13, color: palette.muted, marginBottom: 24 }}>Step {step} of {TOTAL_STEPS} — {STEP_TITLES[step]}</p>

          {/* Stepper */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s, i) => {
              const done = s < step
              const current = s === step
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < TOTAL_STEPS - 1 ? 1 : 'none' }}>
                  <div
                    className={done ? 'step-circle-done' : undefined}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      background: done ? '#16A34A' : current ? palette.accent : '#E2E8F0',
                      color: done || current ? '#fff' : '#94A3B8',
                      transition: 'background 0.3s',
                    }}
                  >
                    {done ? '✓' : s}
                  </div>
                  {i < TOTAL_STEPS - 1 && (
                    <div style={{ flex: 1, height: 3, background: '#E2E8F0', margin: '0 4px', borderRadius: 9999, overflow: 'hidden' }}>
                      <div className={done ? 'step-bar-fill' : undefined} style={{ height: '100%', width: done ? '100%' : '0%', background: '#16A34A', borderRadius: 9999, transition: 'width 0.3s' }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <form key={step} onSubmit={handleStepSubmit} className="step-slide">
            {step === 1 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>First Name</label>
                <input autoFocus name="firstName" autoComplete="given-name" value={form.firstName} onChange={set('firstName')} placeholder="Your first name" required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
            )}
            {step === 2 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>Last Name</label>
                <input autoFocus name="lastName" autoComplete="family-name" value={form.lastName} onChange={set('lastName')} placeholder="Your last name" required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
            )}
            {step === 3 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>Phone Number</label>
                <input autoFocus name="phone" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="Your direct contact phone number" required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
            )}
            {step === 4 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>Company / Operator Name</label>
                <input autoFocus name="company" autoComplete="organization" value={form.company} onChange={set('company')} placeholder="Full name of your organisation" required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
            )}
            {step === 5 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>Email Address</label>
                <input autoFocus name="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="Your work email address" required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
            )}
            {step === 6 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>Password</label>
                <input autoFocus name="password" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} placeholder="Create a strong password" required minLength={8} style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
                <ul style={{ listStyle: 'none', padding: 0, marginTop: 14 }}>
                  {passwordChecks.map((rule) => (
                    <li key={rule.label} style={{ color: rule.valid ? '#16A34A' : '#94A3B8', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12.5, fontWeight: 500 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: rule.valid ? '#16A34A' : '#CBD5E1', flexShrink: 0 }} />
                      {rule.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {step === 7 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>Confirm Password</label>
                <input autoFocus name="confirmPassword" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="Re-enter your password" required minLength={8} style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
            )}
            {step === 8 && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>Verification Code</label>
                <p style={{ fontSize: 12.5, color: palette.muted, marginBottom: 10 }}>Enter the 6-digit code we sent to {form.email}.</p>
                <input autoFocus name="code" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
            )}

            {error && <p style={{ fontSize: 13, color: '#DC2626', marginBottom: 16 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 12 }}>
              {step > 1 && (
                <button type="button" onClick={goBack} disabled={loading} style={{ flex: '0 0 auto', padding: '13px 22px', borderRadius: 9999, border: '1.5px solid #E2E8F0', background: '#fff', color: palette.navy, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                  Back
                </button>
              )}
              <button type="submit" disabled={loading} style={{ flex: 1, padding: '13px', borderRadius: 9999, border: 'none', background: loading ? '#9CA3AF' : palette.accent, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                {loading ? 'Please wait…' : step === 8 ? 'Verify & Create Account' : 'Next'}
              </button>
            </div>
          </form>

          <div style={{ textAlign: 'center', marginTop: 24 }}>
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
