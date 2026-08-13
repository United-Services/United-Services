'use client'
import { useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { useTranslations } from 'next-intl'
import { startRegistration } from '@simplewebauthn/browser'
import { palette, inputStyle } from '../theme'
import Spinner, { InlineSpinner } from '../components/Spinner'
import { api, authHeader } from '../lib/api'

interface Props {
  onNavigate: (page: string) => void
}

export default function AdminMfaSetup({ onNavigate }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations('adminMfaSetup')
  const [method, setMethod] = useState<'choose' | 'totp' | 'webauthn'>('choose')
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const startTotp = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const { data } = await api.post('/mfa/totp/enroll', {}, { headers: authHeader(token) })
      setQrCodeDataUrl(data.qrCodeDataUrl)
      setSecret(data.secret)
      setMethod('totp')
    } catch {
      setError(t('errors.totpStartFailed'))
    } finally {
      setLoading(false)
    }
  }

  const confirmTotp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      await api.post('/mfa/totp/confirm', { code }, { headers: authHeader(token) })
      setDone(true)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t('errors.invalidCode'))
    } finally {
      setLoading(false)
    }
  }

  const startWebAuthn = async () => {
    setLoading(true)
    setError(null)
    setMethod('webauthn')
    try {
      const token = await getToken()
      const { data: options } = await api.post('/mfa/webauthn/register-options', {}, { headers: authHeader(token) })
      const response = await startRegistration({ optionsJSON: options })
      await api.post('/mfa/webauthn/register-verify', { response, label: 'Biometric credential' }, { headers: authHeader(token) })
      setDone(true)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t('errors.webauthnFailed'))
      setMethod('choose')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', fontFamily: 'Poppins, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 480, width: '100%', background: '#fff', borderRadius: 24, padding: '56px 48px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 20px', color: '#16A34A' }}>✓</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: palette.navy, marginBottom: 10 }}>{t('doneTitle')}</h2>
          <p style={{ fontSize: 14, color: palette.muted, lineHeight: 1.7, marginBottom: 28 }}>
            {t('doneBody')}
          </p>
          <button onClick={() => onNavigate('admin-dashboard')} style={{ background: palette.accent, color: '#fff', border: 'none', borderRadius: 9999, padding: '12px 32px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
            {t('continueToDashboard')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', fontFamily: 'Poppins, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 480, width: '100%', background: '#fff', borderRadius: 24, padding: '48px', border: '1px solid #E2E8F0' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: palette.navy, marginBottom: 8 }}>{t('title')}</h1>
        <p style={{ fontSize: 14, color: palette.muted, lineHeight: 1.7, marginBottom: 28 }}>
          {t('subtitle')}
        </p>

        {method === 'choose' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={startTotp} disabled={loading} style={{ textAlign: 'left', padding: '18px 20px', borderRadius: 14, border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: palette.navy, marginBottom: 4 }}>{t('authenticatorApp')}</div>
              <div style={{ fontSize: 12.5, color: palette.muted }}>{t('authenticatorAppDesc')}</div>
            </button>
            <button onClick={startWebAuthn} disabled={loading} style={{ textAlign: 'left', padding: '18px 20px', borderRadius: 14, border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: palette.navy, marginBottom: 4 }}>{t('biometric')}</div>
              <div style={{ fontSize: 12.5, color: palette.muted }}>{t('biometricDesc')}</div>
            </button>
          </div>
        )}

        {method === 'totp' && qrCodeDataUrl && (
          <form onSubmit={confirmTotp}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <img src={qrCodeDataUrl} alt="TOTP QR code" style={{ width: 180, height: 180, margin: '0 auto', border: '1px solid #E2E8F0', borderRadius: 12 }} />
              {secret && (
                <p style={{ fontSize: 11, color: palette.muted, marginTop: 10, wordBreak: 'break-all' }}>
                  {t('cantScan')} <strong>{secret}</strong>
                </p>
              )}
            </div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 7 }}>{t('enterCode')}</label>
            <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('codePlaceholder')} required autoComplete="one-time-code" style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
            {error && <p style={{ fontSize: 13, color: '#DC2626', marginTop: 14 }}>{error}</p>}
            <button type="submit" disabled={loading} style={{ width: '100%', marginTop: 20, padding: '13px', borderRadius: 9999, border: 'none', background: loading ? '#9CA3AF' : palette.accent, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              {loading ? <><InlineSpinner size={14} /> {t('verifying')}</> : t('verifyAndEnable')}
            </button>
            <button type="button" onClick={() => setMethod('choose')} style={{ width: '100%', marginTop: 10, padding: '10px', borderRadius: 9999, border: 'none', background: 'none', color: palette.muted, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
              {t('back')}
            </button>
          </form>
        )}

        {method === 'webauthn' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Spinner size="sm" message={loading ? t('followPrompt') : t('waiting')} />
            {error && <p style={{ fontSize: 13, color: '#DC2626', marginTop: 14 }}>{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
