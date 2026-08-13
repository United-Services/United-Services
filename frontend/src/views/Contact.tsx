'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { palette, inputStyle } from '../theme'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'

interface Props { onNavigate: (page: string) => void }

const SERVICE_KEYS = ['gre', 'wrap', 'coating', 'hdpe', 'rtp', 'rtv'] as const

export default function Contact({ onNavigate }: Props) {
  const t = useTranslations('contact')
  const tSvc = useTranslations('services.names')
  const [form, setForm] = useState({ name: '', email: '', company: '', service: '', message: '' })
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => { setLoading(false); setSent(true) }, 900)
  }

  const contactCards = [
    { icon: '📍', label: t('info.headquarters'), value: t('info.headquartersValue') },
    { icon: '✉️', label: t('info.email'), value: 'info@use-eg.com', href: 'mailto:info@use-eg.com' },
    { icon: '📞', label: t('info.tel'), value: '(+2) 0227033656', href: 'tel:+20227033656' },
    { icon: '🌍', label: t('info.operations'), value: t('info.operationsValue') },
  ]

  return (
    <div style={{ fontFamily: 'Poppins, sans-serif', background: '#fff' }}>
      <PublicNav current="contact" onNavigate={onNavigate} />
      <div style={{ height: 68 }} />

      <section style={{ padding: '72px 28px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 80 }}>
          {/* Info */}
          <div>
            <h1 style={{ fontSize: 42, fontWeight: 800, color: palette.navy, letterSpacing: '-0.03em', marginBottom: 20, lineHeight: 1.1 }}>{t('title')}</h1>
            <p style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8, marginBottom: 40 }}>
              {t('subtitle')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {contactCards.map((c) => (
                <div key={c.label} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: palette.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    {c.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: palette.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</div>
                    {c.href ? (
                      <a href={c.href} style={{ fontSize: 14, color: palette.navy, fontWeight: 600, marginTop: 2, display: 'block', textDecoration: 'none' }}>{c.value}</a>
                    ) : (
                      <div style={{ fontSize: 14, color: palette.navy, fontWeight: 600, marginTop: 2 }}>{c.value}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Map */}
            <a
              href="https://maps.app.goo.gl/hfusekSTTf62MYTb9?g_st=ic"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'block', marginTop: 32, borderRadius: 20, overflow: 'hidden', border: `1px solid ${palette.border}`, position: 'relative' }}
            >
              <iframe
                title={t('mapAlt')}
                src="https://maps.google.com/maps?q=29.982695,31.272598&z=16&output=embed"
                width="100%"
                height="260"
                style={{ border: 0, display: 'block', pointerEvents: 'none' }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <div style={{ position: 'absolute', bottom: 12, right: 12, background: '#fff', borderRadius: 9999, padding: '8px 16px', fontSize: 12, fontWeight: 700, color: palette.accent, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                {t('openInMaps')}
              </div>
            </a>
          </div>

          {/* Form */}
          {sent ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F0FDF4', borderRadius: 24, padding: '60px 48px', border: '1px solid #BBF7D0', textAlign: 'center' }}>
              <div style={{ fontSize: 52, marginBottom: 20 }}>✓</div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: '#166534', marginBottom: 12 }}>{t('sent.title')}</h2>
              <p style={{ fontSize: 15, color: '#15803D', lineHeight: 1.7 }}>
                {t.rich('sent.body', {
                  name: form.name.split(' ')[0],
                  email: form.email,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ background: '#F8FAFC', borderRadius: 24, padding: '48px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>{t('form.fullName')}</label>
                  <input value={form.name} onChange={set('name')} placeholder={t('form.fullNamePlaceholder')} required style={inputStyle}
                    onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>{t('form.emailAddress')}</label>
                  <input type="email" value={form.email} onChange={set('email')} placeholder={t('form.emailPlaceholder')} required style={inputStyle}
                    onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>{t('form.company')}</label>
                <input value={form.company} onChange={set('company')} placeholder={t('form.companyPlaceholder')} required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>{t('form.service')}</label>
                <select value={form.service} onChange={set('service')} required style={{ ...inputStyle, appearance: 'none' }}
                  onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = palette.accent }} onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = '#E2E8F0' }}>
                  <option value="">{t('form.servicePlaceholder')}</option>
                  {SERVICE_KEYS.map((key) => (
                    <option key={key} value={key}>{tSvc(key)}</option>
                  ))}
                  <option value="general">{t('form.serviceGeneral')}</option>
                </select>
              </div>
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>{t('form.description')}</label>
                <textarea value={form.message} onChange={set('message')} placeholder={t('form.descriptionPlaceholder')} required rows={5}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 120 }}
                  onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = palette.accent }} onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = '#E2E8F0' }} />
              </div>
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: 9999, border: 'none', background: loading ? '#9CA3AF' : palette.accent, color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                {loading ? t('form.sending') : t('form.submit')}
              </button>
            </form>
          )}
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
