'use client'
import { palette } from '../theme'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'
import { useReveal } from '../hooks/useReveal'
const worldImg = '/images/LD-02.png'
const weldImg = '/images/bp-plant.jpg'

interface Props { onNavigate: (page: string) => void }

export default function About({ onNavigate }: Props) {
  useReveal()
  return (
    <div style={{ fontFamily: 'Poppins, sans-serif', background: '#fff' }}>
      <PublicNav current="about" onNavigate={onNavigate} />

      {/* Header */}
      <section style={{ background: palette.navy, padding: '120px 28px 80px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 20 }}>USE · SHEET 03 · COMPANY PROFILE</div>
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', maxWidth: 640, lineHeight: 1.05 }}>
            About United Services Egypt
          </h1>
        </div>
      </section>

      {/* Story */}
      <section style={{ padding: '80px 28px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>
          <div className="reveal-left">
            <img src={worldImg} alt="Industrial pipe racking at a processing facility" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.1)' }} />
          </div>
          <div className="reveal-right">
            <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>Founded 2005 · Cairo, Egypt</div>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: palette.navy, letterSpacing: '-0.02em', marginBottom: 20 }}>Built on the premise that corrosion is an engineering problem — not an inevitability.</h2>
            <p style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8, marginBottom: 16 }}>
              United Services Egypt was established in 2005 by a group of petroleum engineers who had spent their careers watching preventable corrosion failures drain resources from major oil & gas operators across the MENA region.
            </p>
            <p style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8, marginBottom: 16 }}>
              Their conviction: that international-standard corrosion-control solutions — GRE lining, FBE coating, RTP systems — were available globally but applied inconsistently in Egypt and the broader region, largely due to a lack of local engineering expertise and certified manufacturing capacity.
            </p>
            <p style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8 }}>
              USE was built to close that gap. Today, from our 6,000 m² integrated manufacturing and application facility in Cairo, we serve EGPC, ADNOC, BP, Shell, and more than fifteen other major operators across Egypt, Iraq, Saudi Arabia, and the UAE.
            </p>
          </div>
        </div>
      </section>

      {/* Certifications */}
      <section style={{ background: '#F8FAFC', padding: '72px 28px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 56 }}>
            <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>QUALITY CREDENTIALS</div>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: palette.navy, letterSpacing: '-0.02em' }}>Certified to international standards.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
            {[
              { code: 'API Q1', body: 'American Petroleum Institute', detail: 'Quality Management System for petroleum equipment manufacturers' },
              { code: 'ISO 9001', body: 'DNV · Quality Management', detail: 'International quality management standard, certified by DNV GL' },
              { code: 'ISO 14001', body: 'Environmental Management', detail: 'Environmental management system conformance' },
              { code: 'ISO 45001', body: 'Occupational H&S', detail: 'Occupational health and safety management system' },
              { code: 'EGPC', body: 'Egyptian General Petroleum', detail: 'Registered vendor to the Egyptian General Petroleum Corporation' },
            ].map((c, i) => (
              <div key={c.code} className="reveal" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '28px 20px', textAlign: 'center', transitionDelay: `${i * 0.08}s` }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: palette.accent, marginBottom: 8, letterSpacing: '-0.01em' }}>{c.code}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: palette.navy, marginBottom: 8 }}>{c.body}</div>
                <div style={{ fontSize: 11, color: palette.muted, lineHeight: 1.6 }}>{c.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Facility */}
      <section style={{ padding: '72px 28px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>
          <div className="reveal-left">
            <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>OUR FACILITY</div>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: palette.navy, letterSpacing: '-0.02em', marginBottom: 20 }}>6,000 m² integrated manufacturing and application facility.</h2>
            <p style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8, marginBottom: 20 }}>
              The USE facility in Cairo houses factory lining and coating lines, pipe preparation and blast-cleaning equipment, quality control laboratory, and a field operations staging area — all on a single site.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 32 }}>
              {[['6,000 m²', 'Facility footprint'], ['Factory + Field', 'Integrated capability'], ['Egypt · Iraq · KSA · UAE', 'Operating regions'], ['15+ majors', 'Client portfolio']].map(([v, l]) => (
                <div key={l} style={{ background: '#F8FAFC', borderRadius: 14, padding: '20px 20px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: palette.accent }}>{v}</div>
                  <div style={{ fontSize: 12, color: palette.muted, marginTop: 4 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="reveal-right">
            <img src={weldImg} alt="Interior of the USE manufacturing facility with process piping and equipment" style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.12)' }} />
          </div>
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
