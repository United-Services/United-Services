'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { palette, inputStyle } from '../theme'
import { api, authHeader } from '../lib/api'

interface WebAuthnCredentialSummary {
  id: string
  label: string | null
  deviceType: string
  createdAt: string
}

interface MfaStatus {
  mfaEnrolled: boolean
  totpEnrolled: boolean
  webauthnCredentials: WebAuthnCredentialSummary[]
}

// Admin-only MFA management: re-verify, then add another authenticator or
// replace a password. Password reset here never uses an email link — it
// requires a fresh MFA proof in the same request. See
// docs/BUSINESS_RULES.md rule 7.
export default function AdminSecuritySection() {
  const { getToken } = useAuth()
  const [status, setStatus] = useState<MfaStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const [totpQr, setTotpQr] = useState<string | null>(null)
  const [totpSecret, setTotpSecret] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState('')

  const [resetMethod, setResetMethod] = useState<'totp' | 'webauthn'>('totp')
  const [resetTotpCode, setResetTotpCode] = useState('')
  const [newPassword, setNewPassword] = useState('')

  const loadStatus = async () => {
    const token = await getToken()
    const { data } = await api.get('/mfa/status', { headers: authHeader(token) })
    setStatus(data)
  }

  useEffect(() => {
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addTotp = async () => {
    setBusy('totp-start')
    setMessage(null)
    try {
      const token = await getToken()
      const { data } = await api.post('/mfa/totp/enroll', {}, { headers: authHeader(token) })
      setTotpQr(data.qrCodeDataUrl)
      setTotpSecret(data.secret)
    } catch {
      setMessage({ type: 'error', text: 'Could not start TOTP enrollment.' })
    } finally {
      setBusy(null)
    }
  }

  const confirmTotp = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy('totp-confirm')
    setMessage(null)
    try {
      const token = await getToken()
      await api.post('/mfa/totp/confirm', { code: totpCode }, { headers: authHeader(token) })
      setTotpQr(null)
      setTotpSecret(null)
      setTotpCode('')
      setMessage({ type: 'ok', text: 'Authenticator app updated.' })
      await loadStatus()
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.response?.data?.message ?? 'Invalid code.' })
    } finally {
      setBusy(null)
    }
  }

  const addWebAuthn = async () => {
    setBusy('webauthn')
    setMessage(null)
    try {
      const token = await getToken()
      const { data: options } = await api.post('/mfa/webauthn/register-options', {}, { headers: authHeader(token) })
      const response = await startRegistration({ optionsJSON: options })
      const label = window.prompt('Label this credential (e.g. "MacBook Touch ID")') ?? undefined
      await api.post('/mfa/webauthn/register-verify', { response, label }, { headers: authHeader(token) })
      setMessage({ type: 'ok', text: 'New credential registered.' })
      await loadStatus()
    } catch {
      setMessage({ type: 'error', text: 'Could not register the credential.' })
    } finally {
      setBusy(null)
    }
  }

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy('reset')
    setMessage(null)
    try {
      const token = await getToken()
      if (resetMethod === 'totp') {
        await api.post(
          '/mfa/admin-password-reset',
          { method: 'totp', totpCode: resetTotpCode, newPassword },
          { headers: authHeader(token) },
        )
      } else {
        const { data: options } = await api.post('/mfa/webauthn/auth-options', {}, { headers: authHeader(token) })
        const response = await startAuthentication({ optionsJSON: options })
        await api.post(
          '/mfa/admin-password-reset',
          { method: 'webauthn', webauthnResponse: response, newPassword },
          { headers: authHeader(token) },
        )
      }
      setNewPassword('')
      setResetTotpCode('')
      setMessage({ type: 'ok', text: 'Password updated. You have been signed out of other sessions.' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.response?.data?.message ?? 'Could not reset password.' })
    } finally {
      setBusy(null)
    }
  }

  if (!status) return <div style={{ fontSize: 13, color: palette.muted }}>Loading…</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 640 }}>
      {message && (
        <div style={{ padding: '12px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: message.type === 'ok' ? '#F0FDF4' : '#FEF2F2', color: message.type === 'ok' ? '#16A34A' : '#DC2626', border: `1px solid ${message.type === 'ok' ? '#BBF7D0' : '#FECACA'}` }}>
          {message.text}
        </div>
      )}

      {/* Authenticator app */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: palette.navy, marginBottom: 4 }}>Authenticator App</div>
        <div style={{ fontSize: 13, color: palette.muted, marginBottom: 16 }}>
          Status: <strong style={{ color: status.totpEnrolled ? '#16A34A' : palette.muted }}>{status.totpEnrolled ? 'Enabled' : 'Not enrolled'}</strong>
        </div>

        {totpQr ? (
          <form onSubmit={confirmTotp}>
            <img src={totpQr} alt="TOTP QR code" style={{ width: 160, height: 160, border: '1px solid #E2E8F0', borderRadius: 12, marginBottom: 10 }} />
            {totpSecret && <p style={{ fontSize: 11, color: palette.muted, marginBottom: 12, wordBreak: 'break-all' }}>Manual entry: <strong>{totpSecret}</strong></p>}
            <input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" required style={inputStyle} />
            <button type="submit" disabled={busy === 'totp-confirm'} style={{ marginTop: 12, padding: '10px 20px', borderRadius: 9999, border: 'none', background: palette.accent, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              Verify & Save
            </button>
          </form>
        ) : (
          <button onClick={addTotp} disabled={busy === 'totp-start'} style={{ padding: '10px 20px', borderRadius: 9999, border: '1.5px solid #E2E8F0', background: '#fff', color: palette.navy, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
            {status.totpEnrolled ? 'Replace Authenticator App' : 'Set Up Authenticator App'}
          </button>
        )}
      </div>

      {/* WebAuthn credentials */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: palette.navy, marginBottom: 4 }}>Biometric / Security Key Credentials</div>
        <div style={{ fontSize: 13, color: palette.muted, marginBottom: 16 }}>
          {status.webauthnCredentials.length === 0 ? 'None registered.' : `${status.webauthnCredentials.length} registered.`}
        </div>
        {status.webauthnCredentials.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, marginBottom: 16 }}>
            {status.webauthnCredentials.map((c) => (
              <li key={c.id} style={{ fontSize: 13, color: palette.slate, padding: '8px 0', borderTop: '1px solid #F1F5F9' }}>
                {c.label || c.deviceType} — added {new Date(c.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        )}
        <button onClick={addWebAuthn} disabled={busy === 'webauthn'} style={{ padding: '10px 20px', borderRadius: 9999, border: '1.5px solid #E2E8F0', background: '#fff', color: palette.navy, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
          Add Another Credential
        </button>
      </div>

      {/* Password reset — MFA-gated, not email-link based */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: palette.navy, marginBottom: 4 }}>Reset Password</div>
        <p style={{ fontSize: 13, color: palette.muted, marginBottom: 16 }}>
          Requires a fresh MFA verification — no email link is sent for admin accounts.
        </p>
        <form onSubmit={resetPassword}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button type="button" onClick={() => setResetMethod('totp')} style={{ flex: 1, padding: '9px', borderRadius: 9999, border: `1.5px solid ${resetMethod === 'totp' ? palette.accent : '#E2E8F0'}`, background: resetMethod === 'totp' ? palette.accentLight : '#fff', color: resetMethod === 'totp' ? palette.accent : palette.muted, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              Authenticator Code
            </button>
            <button type="button" onClick={() => setResetMethod('webauthn')} style={{ flex: 1, padding: '9px', borderRadius: 9999, border: `1.5px solid ${resetMethod === 'webauthn' ? palette.accent : '#E2E8F0'}`, background: resetMethod === 'webauthn' ? palette.accentLight : '#fff', color: resetMethod === 'webauthn' ? palette.accent : palette.muted, fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              Biometric
            </button>
          </div>

          {resetMethod === 'totp' && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>Current Authenticator Code</label>
              <input value={resetTotpCode} onChange={(e) => setResetTotpCode(e.target.value)} placeholder="123456" autoComplete="one-time-code" required style={inputStyle} />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>New Password</label>
            <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} style={inputStyle} />
          </div>

          <button type="submit" disabled={busy === 'reset'} style={{ padding: '10px 24px', borderRadius: 9999, border: 'none', background: palette.accent, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
            {resetMethod === 'webauthn' ? 'Verify Biometric & Reset' : 'Verify & Reset Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
