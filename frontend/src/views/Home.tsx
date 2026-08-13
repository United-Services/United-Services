'use client'
import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { palette } from '../theme'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'
import { useReveal } from '../hooks/useReveal'

const ldImg = '/images/LD-03.png'
const heroImg = '/images/hero-petroleum-v001.webp'
const worldImg = '/images/world-corridor.jpg'

const HERO_URL = heroImg
const WORLD_URL = worldImg
const PIPES_URL = 'https://images.unsplash.com/photo-1764835746713-34a671e73569?w=900&q=80'
const WELD_URL = 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=900&q=80'

const adnocLogo = '/images/adnoc.png'
const bpLogo = '/images/bp.png'
const eniLogo = '/images/eni.png'
const petrobelLogo = '/images/petrobel.png'
const apacheLogo = '/images/apache.png'
const bapetcoLogo = '/images/bapetco.png'
const khaldaLogo = '/images/khalda.png'
const agibaLogo = '/images/agiba.png'
const ososcoLogo = '/images/osoco.png'
const daraLogo = '/images/dara.png'
const shellLogo = '/images/shell.png'
const qarunLogo = '/images/qarun.png'
const qpLogo = '/images/qp.png'
const westLogo = '/images/west.png'
const petrosilahLogo = '/images/petrosilah.png'

interface Props { onNavigate: (page: string, param?: string) => void }

const LOGO_CLIENTS = [
  { name: 'ADNOC', img: adnocLogo },
  { name: 'BP', img: bpLogo },
  { name: 'ENI', img: eniLogo },
  { name: 'Petrobel', img: petrobelLogo },
  { name: 'Apache', img: apacheLogo },
  { name: 'Bapetco', img: bapetcoLogo },
  { name: 'Khalda', img: khaldaLogo },
  { name: 'Agiba', img: agibaLogo },
  { name: 'OSOCO', img: ososcoLogo },
  { name: 'Dara', img: daraLogo },
  { name: 'Shell', img: shellLogo },
  { name: 'Qarun', img: qarunLogo },
  { name: 'QP', img: qpLogo },
  { name: 'West', img: westLogo },
  { name: 'Petrosilah', img: petrosilahLogo },
]

const CERT_KEYS = ['apiQ1', 'iso9001', 'iso14001', 'iso45001', 'egpc'] as const
const CERT_CODES: Record<(typeof CERT_KEYS)[number], string> = {
  apiQ1: 'API Q1', iso9001: 'ISO 9001', iso14001: 'ISO 14001', iso45001: 'ISO 45001', egpc: 'EGPC',
}
const SERVICE_KEYS = ['gre', 'wrap', 'coating', 'hdpe', 'rtp', 'rtv'] as const
const SERVICE_COLORS: Record<(typeof SERVICE_KEYS)[number], string> = {
  gre: '#FFF7ED', wrap: '#F0FDF4', coating: '#EFF6FF', hdpe: '#FDF4FF', rtp: '#FFF7ED', rtv: '#F0FDF4',
}

export default function Home({ onNavigate }: Props) {
  useReveal()
  const t = useTranslations('home')
  const tSvc = useTranslations('services.names')
  const tSpec = useTranslations('services.specs')
  const tNav = useTranslations('nav')
  const locale = useLocale()
  const arrow = locale === 'ar' ? '←' : '→'
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1600)
    return () => clearTimeout(timer)
  }, [])

  const STATS = [
    { value: '2005', label: t('proof.yearFoundedLabel') },
    { value: '6,000 m²', label: t('proof.facilityLabel') },
    { value: '4', label: t('proof.countriesLabel') },
    { value: '15+', label: t('proof.clientsLabel') },
  ]

  return (
    <>
      {/* Calibration screen */}
      {loading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: palette.navy, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#fff', letterSpacing: '0.04em', marginBottom: 32 }}>
            USE
          </div>
          <div style={{ fontSize: 12, color: '#64748B', letterSpacing: '0.15em' }}>
            {t('loading.calibrating')}<span className="blink">_</span>
          </div>
          <div style={{ marginTop: 40, width: 180, height: 2, background: '#1E293B', borderRadius: 9999, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: palette.accent, borderRadius: 9999, animation: 'shimmer 1.4s ease forwards', width: '100%' }} />
          </div>
        </div>
      )}

      <div style={{ fontFamily: 'Poppins, sans-serif', background: '#fff', opacity: loading ? 0 : 1, transition: 'opacity 0.4s' }}>
        <PublicNav current="home" onNavigate={onNavigate} />

        {/* ── HERO ── */}
        <section style={{ position: 'relative', height: '100vh', minHeight: 600, overflow: 'hidden' }}>
          <img src={HERO_URL} alt="Oil refinery industrial pipeline infrastructure" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(15,23,42,0.72) 0%, rgba(15,23,42,0.55) 50%, rgba(15,23,42,0.92) 100%)' }} />
          <div style={{ position: 'relative', zIndex: 2, maxWidth: 1260, margin: '0 auto', padding: '0 28px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 100 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.2em', color: '#94A3B8', textTransform: 'uppercase', marginBottom: 24 }}>
              {t('hero.eyebrow')}
            </div>
            <h1 style={{ fontSize: 'clamp(42px, 7vw, 88px)', fontWeight: 800, color: '#fff', lineHeight: 1.0, letterSpacing: '-0.03em', marginBottom: 24, maxWidth: 760 }}>
              {t('hero.titleLine1')}<br />{t('hero.titleLine2')}
            </h1>
            <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: '#CBD5E1', maxWidth: 520, lineHeight: 1.6, marginBottom: 40 }}>
              {t('hero.bodyLine1')}<br />
              <span style={{ color: '#fff', fontWeight: 600 }}>{t('hero.bodyLine2')}</span>
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <button onClick={() => onNavigate('services')} style={{ background: palette.accent, color: '#fff', border: 'none', borderRadius: 9999, padding: '14px 36px', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'background 0.2s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = palette.accentDark }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = palette.accent }}>
                {t('hero.ctaServices')}
              </button>
              <button onClick={() => onNavigate('contact')} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 9999, padding: '14px 36px', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', backdropFilter: 'blur(8px)', transition: 'background 0.2s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.18)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)' }}>
                {t('hero.ctaConsultation')}
              </button>
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#475569', textTransform: 'uppercase' }}>{t('hero.scroll')}</div>
            <div style={{ width: 1, height: 40, background: 'linear-gradient(to bottom, #475569, transparent)' }} />
          </div>
        </section>

        {/* ── CERT STRIP ── */}
        <section style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', padding: '20px 0', overflow: 'hidden' }}>
          <div className="marquee-track">
            {[...CERT_KEYS, ...CERT_KEYS].map((key, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 40px', borderRight: '1px solid #E2E8F0', flexShrink: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: palette.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10.1 4.4 12l.7-4L2.2 5.2l4-.6z" fill={palette.accent} />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: palette.navy }}>{CERT_CODES[key]}</div>
                  <div style={{ fontSize: 11, color: palette.muted }}>{t(`certs.${key}`)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 01 THE WORLD ── */}
        <section style={{ position: 'relative', height: '80vh', minHeight: 500, overflow: 'hidden' }}>
          <img src={WORLD_URL} alt="Industrial pipeline infrastructure" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.5) 60%, rgba(15,23,42,0.2) 100%)' }} />
          <div style={{ position: 'relative', zIndex: 2, maxWidth: 1260, margin: '0 auto', padding: '0 28px', height: '100%', display: 'flex', alignItems: 'center' }}>
            <div className="reveal" style={{ maxWidth: 580 }}>
              <div style={{ fontSize: 11, color: '#EA580C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>
                {t('world.eyebrow')}
              </div>
              <h2 style={{ fontSize: 'clamp(30px, 4vw, 52px)', fontWeight: 800, color: '#fff', lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 20 }}>
                {t('world.title')}
              </h2>
              <p style={{ fontSize: 16, color: '#CBD5E1', lineHeight: 1.7 }}>
                {t('world.body')}
              </p>
            </div>
          </div>
        </section>

        {/* ── 02 THE PROBLEM ── */}
        <section style={{ background: '#fff', padding: '100px 28px' }}>
          <div style={{ maxWidth: 1260, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
            <div className="reveal-left">
              <img src={ldImg} alt="Close-up cross-section of a pipeline showing coating and corrosion layers" style={{ width: '100%', aspectRatio: '16/10', objectFit: 'cover', borderRadius: 20, boxShadow: '0 24px 80px rgba(0,0,0,0.12)' }} />
            </div>
            <div className="reveal-right">
              <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>
                {t('problem.eyebrow')}
              </div>
              <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 800, color: palette.navy, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 20 }}>
                {t('problem.title')}
              </h2>
              <p style={{ fontSize: 16, color: palette.slate, lineHeight: 1.7, marginBottom: 20 }}>
                {t('problem.body1')}
              </p>
              <p style={{ fontSize: 16, color: palette.slate, lineHeight: 1.7 }}>
                {t.rich('problem.body2', { em: (chunks) => <em>{chunks}</em> })}
              </p>
            </div>
          </div>
        </section>

        {/* ── 03 METHODOLOGY ── */}
        <section style={{ background: '#F8FAFC', padding: '100px 28px' }}>
          <div style={{ maxWidth: 1260, margin: '0 auto' }}>
            <div className="reveal" style={{ textAlign: 'center', marginBottom: 72 }}>
              <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>
                {t('methodology.eyebrow')}
              </div>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, color: palette.navy, letterSpacing: '-0.02em', marginBottom: 16 }}>
                {t('methodology.title')}
              </h2>
              <p style={{ fontSize: 16, color: palette.muted, maxWidth: 500, margin: '0 auto' }}>
                {t('methodology.subtitle')}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
              {[
                { key: 'assess', img: ldImg as unknown as string },
                { key: 'engineer', img: PIPES_URL },
                { key: 'execute', img: WELD_URL },
              ].map((step, i) => (
                <div key={step.key} className="reveal" style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', border: '1px solid #E2E8F0', transition: 'box-shadow 0.2s, transform 0.2s', transitionDelay: `${i * 0.1}s` }}
                  onMouseEnter={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = '0 12px 48px rgba(0,0,0,0.1)'; el.style.transform = 'translateY(-4px)' }}
                  onMouseLeave={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = 'none'; el.style.transform = 'none' }}>
                  <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
                    <img src={step.img} alt={t(`methodology.${step.key}.title` as any)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)' }} />
                    <div style={{ position: 'absolute', top: 20, left: 20, fontSize: 48, fontWeight: 900, color: 'rgba(255,255,255,0.15)', lineHeight: 1 }}>{String(i + 1).padStart(2, '0')}</div>
                    <div style={{ position: 'absolute', bottom: 16, left: 20, fontSize: 22, fontWeight: 800, color: '#fff' }}>{t(`methodology.${step.key}.title` as any)}</div>
                  </div>
                  <div style={{ padding: '24px 24px' }}>
                    <p style={{ fontSize: 14, color: palette.slate, lineHeight: 1.7 }}>{t(`methodology.${step.key}.desc` as any)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 04 SERVICES PREVIEW ── */}
        <section style={{ background: '#fff', padding: '100px 28px' }}>
          <div style={{ maxWidth: 1260, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 64, flexWrap: 'wrap', gap: 24 }}>
              <div className="reveal-left">
                <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>{t('servicesPreview.eyebrow')}</div>
                <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, color: palette.navy, letterSpacing: '-0.02em', maxWidth: 520 }}>
                  {t('servicesPreview.title')}
                </h2>
              </div>
              <button className="reveal-right" onClick={() => onNavigate('services')} style={{ background: '#4B5563', color: '#fff', border: 'none', borderRadius: 9999, padding: '13px 32px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', flexShrink: 0 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#374151' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#4B5563' }}>
                {t('servicesPreview.viewAll')} {arrow}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              {SERVICE_KEYS.map((key, i) => (
                <button key={key} className="reveal" onClick={() => onNavigate('services')} style={{ background: SERVICE_COLORS[key], border: '1px solid #E2E8F0', borderRadius: 16, padding: '28px 24px', textAlign: 'start', cursor: 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'box-shadow 0.2s, transform 0.2s', transitionDelay: `${i * 0.08}s` }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; (e.currentTarget as HTMLButtonElement).style.transform = 'none' }}>
                  <div style={{ fontSize: 10, color: palette.accent, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>SVC-0{i + 1}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: palette.navy, marginBottom: 6 }}>{tSvc(key)}</div>
                  <div style={{ fontSize: 12, color: palette.muted, fontWeight: 500 }}>{tSpec(key)}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── 05 PROOF ── */}
        <section style={{ background: palette.navy, padding: '80px 28px' }}>
          <div style={{ maxWidth: 1260, margin: '0 auto' }}>
            <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 56 }}>
              {t('proof.eyebrow')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: '#1E293B' }}>
              {STATS.map((s, i) => (
                <div key={s.label} className="reveal" style={{ background: palette.navy, padding: '48px 32px', textAlign: 'center', transitionDelay: `${i * 0.1}s` }}>
                  <div style={{ fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 800, color: palette.accent, letterSpacing: '-0.02em', lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 13, color: '#64748B', marginTop: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 06 CLIENTS ── */}
        <section style={{ background: '#fff', padding: '80px 0' }}>
          <div style={{ textAlign: 'center', marginBottom: 48, padding: '0 28px' }}>
            <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>
              {t('clients.eyebrow')}
            </div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 36px)', fontWeight: 800, color: palette.navy, letterSpacing: '-0.02em', marginBottom: 12 }}>
              {t('clients.title')}
            </h2>
            <p style={{ fontSize: 14, color: palette.muted }}>ADNOC · BP · Shell · ENI · Petrobel · Apache · Bapetco · Khalda · Qarun · QP · Agiba · OSOCO · West · Petrosilah · Dara</p>
          </div>

          {/* Logo marquee — row 1 */}
          <div style={{ overflow: 'hidden', marginBottom: 0 }}>
            <div className="marquee-track">
              {[...LOGO_CLIENTS, ...LOGO_CLIENTS].map((c, i) => (
                <button
                  key={i}
                  onClick={() => onNavigate('projects', c.name)}
                  title={t('clients.viewProjectsWith', { name: c.name })}
                  style={{ padding: '0 32px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80, borderRight: '1px solid #F1F5F9', background: 'none', border: 'none', borderRightWidth: 1, borderRightStyle: 'solid', borderRightColor: '#F1F5F9', cursor: 'pointer' }}
                >
                  <img src={c.img} alt={c.name} style={{ height: 52, width: 'auto', maxWidth: 120, objectFit: 'contain', filter: 'grayscale(100%) opacity(0.55)', transition: 'filter 0.2s' }}
                    onMouseEnter={(e) => { (e.target as HTMLImageElement).style.filter = 'grayscale(0%) opacity(1)' }}
                    onMouseLeave={(e) => { (e.target as HTMLImageElement).style.filter = 'grayscale(100%) opacity(0.55)' }} />
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section style={{ background: '#F8FAFC', padding: '80px 28px' }}>
          <div style={{ maxWidth: 1260, margin: '0 auto' }}>
            <div className="reveal" style={{ background: palette.accent, borderRadius: 28, padding: '64px 64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 40, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 40px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', marginBottom: 12 }}>
                  {t('cta.title')}
                </h2>
                <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
                  {t('cta.body')}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <button onClick={() => onNavigate('contact')} style={{ background: '#fff', color: palette.accent, border: 'none', borderRadius: 9999, padding: '14px 36px', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'box-shadow 0.2s' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}>
                  {t('hero.ctaConsultation')}
                </button>
                <button onClick={() => onNavigate('client-login')} style={{ background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: 9999, padding: '14px 36px', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                  {tNav('clientPortal')}
                </button>
              </div>
            </div>
          </div>
        </section>

        <PublicFooter onNavigate={onNavigate} />
      </div>
    </>
  )
}
