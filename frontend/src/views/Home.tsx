'use client'
import { useEffect, useState } from 'react'
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

const CERTS = [
  { code: 'API Q1', label: 'American Petroleum Institute' },
  { code: 'ISO 9001', label: 'Quality Management · DNV' },
  { code: 'ISO 14001', label: 'Environmental Management' },
  { code: 'ISO 45001', label: 'Occupational Health & Safety' },
  { code: 'EGPC', label: 'Egyptian General Petroleum Corp.' },
]

const STATS = [
  { value: '2005', label: 'Year Founded' },
  { value: '6,000 m²', label: 'Integrated Facility' },
  { value: '4', label: 'Countries of Operation' },
  { value: '15+', label: 'Major Clients' },
]

export default function Home({ onNavigate }: Props) {
  useReveal()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1600)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      {/* Calibration screen */}
      {loading && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: palette.navy, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: palette.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#fff', letterSpacing: '0.04em', marginBottom: 32 }}>
            USE
          </div>
          <div style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#475569', marginBottom: 12 }}>
            USE · PORTAL · REV.01
          </div>
          <div style={{ fontSize: 12, color: '#64748B', letterSpacing: '0.15em' }}>
            CALIBRATING SYSTEM<span className="blink">_</span>
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
              UNITED SERVICES EGYPT · EST. 2005
            </div>
            <h1 style={{ fontSize: 'clamp(42px, 7vw, 88px)', fontWeight: 800, color: '#fff', lineHeight: 1.0, letterSpacing: '-0.03em', marginBottom: 24, maxWidth: 760 }}>
              Time leaves<br />its mark.
            </h1>
            <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: '#CBD5E1', maxWidth: 520, lineHeight: 1.6, marginBottom: 40 }}>
              Heat. Pressure. Moisture. Corrosion.<br />
              <span style={{ color: '#fff', fontWeight: 600 }}>United Services Egypt arrests it.</span>
            </p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <button onClick={() => onNavigate('services')} style={{ background: palette.accent, color: '#fff', border: 'none', borderRadius: 9999, padding: '14px 36px', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'background 0.2s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = palette.accentDark }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = palette.accent }}>
                Our Services
              </button>
              <button onClick={() => onNavigate('contact')} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 9999, padding: '14px 36px', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', backdropFilter: 'blur(8px)', transition: 'background 0.2s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.18)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)' }}>
                Request Consultation
              </button>
            </div>
          </div>
          <div style={{ position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 10, letterSpacing: '0.2em', color: '#475569', textTransform: 'uppercase' }}>Scroll</div>
            <div style={{ width: 1, height: 40, background: 'linear-gradient(to bottom, #475569, transparent)' }} />
          </div>
        </section>

        {/* ── CERT STRIP ── */}
        <section style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', padding: '20px 0', overflow: 'hidden' }}>
          <div className="marquee-track">
            {[...CERTS, ...CERTS].map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 40px', borderRight: '1px solid #E2E8F0', flexShrink: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: palette.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4L8 10.1 4.4 12l.7-4L2.2 5.2l4-.6z" fill={palette.accent} />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: palette.navy }}>{c.code}</div>
                  <div style={{ fontSize: 11, color: palette.muted }}>{c.label}</div>
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
                01 — THE WORLD
              </div>
              <h2 style={{ fontSize: 'clamp(30px, 4vw, 52px)', fontWeight: 800, color: '#fff', lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 20 }}>
                Infrastructure that spans nations demands protection that outlasts decades.
              </h2>
              <p style={{ fontSize: 16, color: '#CBD5E1', lineHeight: 1.7 }}>
                From the Nile Delta to the Arabian Gulf, the pipelines and facilities that power modern civilization face relentless attack. Every joint, every weld, every exposed surface is a front line.
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
                02 — THE PROBLEM
              </div>
              <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 800, color: palette.navy, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 20 }}>
                Corrosion doesn"t announce itself.
              </h2>
              <p style={{ fontSize: 16, color: palette.slate, lineHeight: 1.7, marginBottom: 20 }}>
                It works silently — inside pipelines transporting crude and water, beneath thermal insulation, along buried infrastructure. By the time it"s visible, structural compromise has already begun.
              </p>
              <p style={{ fontSize: 16, color: palette.slate, lineHeight: 1.7 }}>
                The question is never <em>whether</em> corrosion will occur. It is whether your system is engineered to stop it before it stops you.
              </p>
            </div>
          </div>
        </section>

        {/* ── 03 METHODOLOGY ── */}
        <section style={{ background: '#F8FAFC', padding: '100px 28px' }}>
          <div style={{ maxWidth: 1260, margin: '0 auto' }}>
            <div className="reveal" style={{ textAlign: 'center', marginBottom: 72 }}>
              <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>
                03 — THE METHODOLOGY
              </div>
              <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, color: palette.navy, letterSpacing: '-0.02em', marginBottom: 16 }}>
                A three-phase discipline.
              </h2>
              <p style={{ fontSize: 16, color: palette.muted, maxWidth: 500, margin: '0 auto' }}>
                Every USE engagement follows the same rigorous sequence — no shortcuts, no compromises.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
              {[
                { n: '01', title: 'Assess', desc: 'Detailed pipeline inspection, corrosion mapping, and condition assessment using API-compliant protocols. We quantify the threat before we prescribe the solution.', img: ldImg as unknown as string },
                { n: '02', title: 'Engineer', desc: 'Material selection, system design, and application engineering tailored to operating pressure, temperature, chemistry, and regulatory requirements.', img: PIPES_URL },
                { n: '03', title: 'Execute', desc: 'Factory application and on-site installation by certified USE technicians, backed by full QA documentation, third-party inspection, and lifecycle support.', img: WELD_URL },
              ].map((step, i) => (
                <div key={step.n} className="reveal" style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', border: '1px solid #E2E8F0', transition: 'box-shadow 0.2s, transform 0.2s', transitionDelay: `${i * 0.1}s` }}
                  onMouseEnter={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = '0 12px 48px rgba(0,0,0,0.1)'; el.style.transform = 'translateY(-4px)' }}
                  onMouseLeave={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.boxShadow = 'none'; el.style.transform = 'none' }}>
                  <div style={{ position: 'relative', height: 200, overflow: 'hidden' }}>
                    <img src={step.img} alt={step.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.45)' }} />
                    <div style={{ position: 'absolute', top: 20, left: 20, fontSize: 48, fontWeight: 900, color: 'rgba(255,255,255,0.15)', lineHeight: 1 }}>{step.n}</div>
                    <div style={{ position: 'absolute', bottom: 16, left: 20, fontSize: 22, fontWeight: 800, color: '#fff' }}>{step.title}</div>
                  </div>
                  <div style={{ padding: '24px 24px' }}>
                    <p style={{ fontSize: 14, color: palette.slate, lineHeight: 1.7 }}>{step.desc}</p>
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
                <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>04 — OUR SERVICES</div>
                <h2 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 800, color: palette.navy, letterSpacing: '-0.02em', maxWidth: 520 }}>
                  Six specialized systems. One integrated company.
                </h2>
              </div>
              <button className="reveal-right" onClick={() => onNavigate('services')} style={{ background: '#4B5563', color: '#fff', border: 'none', borderRadius: 9999, padding: '13px 32px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', flexShrink: 0 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#374151' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#4B5563' }}>
                View All Services →
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              {[
                { name: 'GRE Tubular Lining', spec: 'API 15CLT · Internal Barrier', color: '#FFF7ED' },
                { name: 'External Wrapping', spec: 'ISO 21809 · Multi-Layer Tape', color: '#F0FDF4' },
                { name: 'Industrial Coating', spec: 'FBE / NACE · Fusion-Bonded', color: '#EFF6FF' },
                { name: 'HDPE Lining', spec: 'PE100 / ASTM · Water Injection', color: '#FDF4FF' },
                { name: 'RTP Systems', spec: 'DN40–200 · 0.6–32 MPa', color: '#FFF7ED' },
                { name: 'RTV Insulator Coating', spec: 'IEC 62073 · High-Voltage', color: '#F0FDF4' },
              ].map((s, i) => (
                <button key={s.name} className="reveal" onClick={() => onNavigate('services')} style={{ background: s.color, border: '1px solid #E2E8F0', borderRadius: 16, padding: '28px 24px', textAlign: 'left', cursor: 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'box-shadow 0.2s, transform 0.2s', transitionDelay: `${i * 0.08}s` }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'; (e.currentTarget as HTMLButtonElement).style.transform = 'none' }}>
                  <div style={{ fontSize: 10, color: palette.accent, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>SVC-0{i + 1}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: palette.navy, marginBottom: 6 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: palette.muted, fontWeight: 500 }}>{s.spec}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── 05 PROOF ── */}
        <section style={{ background: palette.navy, padding: '80px 28px' }}>
          <div style={{ maxWidth: 1260, margin: '0 auto' }}>
            <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.2em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 56 }}>
              05 — THE PROOF
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
              06 — OUR CLIENTS
            </div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 36px)', fontWeight: 800, color: palette.navy, letterSpacing: '-0.02em', marginBottom: 12 }}>
              Trusted by the region"s leading operators
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
                  title={`View projects with ${c.name}`}
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
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>USE · ENGAGEMENT</div>
                <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 40px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', marginBottom: 12 }}>
                  Ready to protect your infrastructure?
                </h2>
                <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>
                  Speak with a USE engineer about your specific application and operating conditions.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <button onClick={() => onNavigate('contact')} style={{ background: '#fff', color: palette.accent, border: 'none', borderRadius: 9999, padding: '14px 36px', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'box-shadow 0.2s' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none' }}>
                  Request Consultation
                </button>
                <button onClick={() => onNavigate('client-login')} style={{ background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: 9999, padding: '14px 36px', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                  Client Portal
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
