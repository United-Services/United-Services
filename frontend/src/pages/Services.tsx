import { useState } from 'react'
import { palette } from '../theme'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'
import { useReveal } from '../hooks/useReveal'

import greApplicationImg from '../imports/bp-valves.jpg'
import insulatorImg from '../imports/lux-power.jpg'

const SVC_IMGS = {
  svc01: greApplicationImg,
  svc02: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=900&q=80',
  svc03: 'https://images.unsplash.com/photo-1678984239420-43cdc183bce6?w=900&q=80',
  svc04: 'https://images.unsplash.com/photo-1684667273934-e5d39307eeae?w=900&q=80',
  svc05: 'https://images.unsplash.com/photo-1758965364875-e090e5423d2d?w=900&q=80',
}

interface Props { onNavigate: (page: string) => void }

const SERVICES = [
  {
    id: 'SVC-01',
    name: 'GRE Tubular Lining',
    tag: 'API 15CLT · Internal Corrosion Barrier',
    img: SVC_IMGS.svc01,
    imgAlt: 'Technicians applying GRE lining to a steel pipe at the USE factory',
    desc: 'Glass Reinforced Epoxy (GRE) tubular lining provides a chemically inert internal barrier for steel pipelines carrying crude oil, produced water, and corrosive hydrocarbons. Applied in our 6,000 m² factory under API 15CLT and ISO 15996 quality regimes, USE GRE liners deliver service life exceeding 20 years in H₂S and CO₂ environments.',
    specs: ['API 15CLT Compliant', 'DN50 – DN600', 'Temp. up to 120°C', 'pH 2–12', 'Factory & field jointing'],
  },
  {
    id: 'SVC-02',
    name: 'External Wrapping',
    tag: 'ISO 21809 · Multi-Layer Tape Systems',
    img: SVC_IMGS.svc02,
    imgAlt: 'Welder performing external wrapping application on steel pipe',
    desc: 'Multi-layer cold-applied and heat-shrink tape systems for external pipeline protection against soil corrosion, mechanical damage, and UV degradation. USE external wrap systems are qualified to ISO 21809-3 and DIN 30672 and are used for both onshore buried pipelines and subsea risers across Egypt, Iraq, KSA, and UAE.',
    specs: ['ISO 21809-3 / DIN 30672', 'Mechanical peel ≥ 40 N/10mm', 'Operating temp −20°C to 80°C', 'Cathodic disbondment resistant', 'Holiday detection included'],
  },
  {
    id: 'SVC-03',
    name: 'Industrial Coating',
    tag: 'FBE / NACE · Fusion-Bonded & Liquid Epoxy',
    img: SVC_IMGS.svc03,
    imgAlt: 'Industrial pipeline factory with coating equipment',
    desc: 'Fusion Bonded Epoxy (FBE) and liquid epoxy coating systems for internal and external pipeline protection. Applied at the USE facility using induction-heated pipe rotation equipment, our coatings meet NACE SP0188 and CSA Z245.20 standards. Suitable for water injection, crude service, and gas distribution pipelines.',
    specs: ['NACE SP0188', 'CSA Z245.20', 'DFT 300–500 µm FBE', 'Holiday free @ 3 kV/mm', 'Chemical cure verification'],
  },
  {
    id: 'SVC-04',
    name: 'HDPE Lining',
    tag: 'PE100 / ASTM · Water Injection & Chemical Lines',
    img: SVC_IMGS.svc04,
    imgAlt: 'Stacked HDPE plastic pipes ready for installation',
    desc: 'High-Density Polyethylene (HDPE) slip-lining and factory-installed liner systems for water injection pipelines, chemical transport lines, and produced water reinjection systems. PE100 grade material conforming to ASTM D3350 and ISO 4427, providing full corrosion immunity and hydraulic efficiency improvement.',
    specs: ['PE100 / ASTM D3350', 'ISO 4427 Compliant', 'Pressure rating to 25 bar', 'Temp. −40°C to 60°C', 'Electrofusion or butt-fusion joints'],
  },
  {
    id: 'SVC-05',
    name: 'RTP Systems',
    tag: 'DN40–200 · 0.6–32 MPa · Reinforced Thermoplastic',
    img: SVC_IMGS.svc05,
    imgAlt: 'Large industrial spool of reinforced thermoplastic pipe',
    desc: 'Reinforced Thermoplastic Pipe (RTP) systems for oil, gas, and water service in corrosive environments where steel pipelines are uneconomical. USE RTP covers sizes DN40 to DN200 at operating pressures from 0.6 MPa to 32 MPa. Continuous-length manufacture minimises field joints; lightweight spooled delivery accelerates installation by up to 40% versus steel.',
    specs: ['DN40 – DN200', '0.6 – 32 MPa', 'Oil / gas / water service', 'Continuous spool lengths', 'ISO 18226 / API 15S'],
  },
  {
    id: 'SVC-06',
    name: 'RTV Insulator Coating',
    tag: 'IEC 62073 · High-Voltage Insulator Protection',
    img: insulatorImg,
    imgAlt: 'High-voltage transmission towers at sunset',
    desc: 'Room Temperature Vulcanising (RTV) silicone coating for high-voltage ceramic and glass insulators operating in polluted environments including desert dust, salt fog, and industrial contamination. USE RTV coatings meet IEC 62073 and IEC 60815, extending insulator service life from 5 to 20+ years and eliminating scheduled insulator washing on transmission lines.',
    specs: ['IEC 62073 / IEC 60815', 'Pollution class IV', 'Hydrophobicity class HC1', 'Operating 11 kV – 500 kV', 'Brush / spray application'],
  },
]

const LAYERS = [
  { label: 'External Wrap / Mechanical Protection', color: '#EA580C', width: '100%' },
  { label: 'Anti-Corrosion Coating (FBE / Epoxy)', color: '#FB923C', width: '88%' },
  { label: 'Steel Substrate', color: '#475569', width: '76%' },
  { label: 'GRE / HDPE Internal Lining', color: '#0EA5E9', width: '62%' },
  { label: 'Protected Flow Zone', color: '#BAE6FD', width: '46%' },
]

export default function Services({ onNavigate }: Props) {
  useReveal()
  const [active, setActive] = useState<number | null>(null)

  return (
    <div style={{ fontFamily: 'Poppins, sans-serif', background: '#fff' }}>
      <PublicNav current="services" onNavigate={onNavigate} />

      {/* Page header */}
      <section style={{ paddingTop: 68, background: palette.navy, padding: '120px 28px 80px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 20 }}>
            USE · SHEET 02 · SYS-INDEX
          </div>
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginBottom: 20, maxWidth: 700 }}>
            Systems Index
          </h1>
          <p style={{ fontSize: 17, color: '#94A3B8', maxWidth: 540, lineHeight: 1.7 }}>
            Six integrated corrosion-control and pipeline-integrity systems, each engineered to international standards at our 6,000 m² Cairo facility.
          </p>
        </div>
      </section>

      {/* Cross-section diagram */}
      <section style={{ background: '#F8FAFC', padding: '72px 28px', borderBottom: '1px solid #E2E8F0' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>
          <div className="reveal-left">
            <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 20 }}>
              USE · CROSS-SECTION DETAIL · REV.03
            </div>
            <h2 style={{ fontSize: 32, fontWeight: 800, color: palette.navy, marginBottom: 12, letterSpacing: '-0.02em' }}>Layered Pipeline Protection</h2>
            <p style={{ fontSize: 14, color: palette.muted, lineHeight: 1.7, marginBottom: 32 }}>
              A complete USE-engineered pipeline assembly integrates all protection layers into one specification, designed as a system — not as separate products.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {LAYERS.map((l, i) => (
                <div
                  key={l.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    animation: `layerSlide 0.4s ease ${i * 0.1}s both`,
                  }}
                >
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: l.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: palette.slate, fontWeight: 500 }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="reveal-right" style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
            {LAYERS.map((l) => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    height: 36,
                    background: l.color,
                    borderRadius: 6,
                    width: l.width,
                    transition: 'width 1s ease',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 12,
                  }}
                >
                  <span style={{ fontSize: 10, color: '#fff', fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                    {l.label.split(' ')[0].toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services list */}
      <section style={{ padding: '80px 28px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {SERVICES.map((s, i) => (
            <div
              key={s.id}
              className="reveal"
              style={{ border: '1px solid #E2E8F0', borderRadius: 20, overflow: 'hidden', transitionDelay: `${i * 0.06}s` }}
            >
              {/* Collapsed header */}
              <button
                onClick={() => setActive(active === i ? null : i)}
                style={{
                  width: '100%',
                  background: active === i ? '#FFF7ED' : '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '28px 32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 24,
                  fontFamily: 'Poppins, sans-serif',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ fontSize: 11, color: active === i ? palette.accent : '#94A3B8', fontWeight: 700, letterSpacing: '0.12em', flexShrink: 0 }}>
                    {s.id}
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: palette.navy }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: palette.muted, marginTop: 2 }}>{s.tag}</div>
                  </div>
                </div>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: active === i ? palette.accent : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s' }}>
                  <span style={{ fontSize: 18, color: active === i ? '#fff' : '#64748B', lineHeight: 1, transform: active === i ? 'rotate(45deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>+</span>
                </div>
              </button>

              {/* Expanded content */}
              {active === i && (
                <div style={{ background: '#FFFAF7', borderTop: '1px solid #FDE8D0', padding: '36px 32px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'start' }}>
                    <div>
                      <img src={s.img} alt={s.imgAlt} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 14, marginBottom: 24 }} />
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {s.specs.map((sp) => (
                          <span key={sp} style={{ fontSize: 12, fontWeight: 600, color: palette.accent, background: palette.accentLight, borderRadius: 6, padding: '4px 10px', border: '1px solid #FED7AA' }}>
                            {sp}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8, marginBottom: 32 }}>{s.desc}</p>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <button
                          onClick={() => onNavigate('client-login')}
                          style={{ background: palette.accent, color: '#fff', border: 'none', borderRadius: 9999, padding: '11px 28px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                        >
                          Request Spec File
                        </button>
                        <button
                          onClick={() => onNavigate('contact')}
                          style={{ background: '#4B5563', color: '#fff', border: 'none', borderRadius: 9999, padding: '11px 28px', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
                        >
                          Request Consultation
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
