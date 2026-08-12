import { palette } from '../theme'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'
import { useReveal } from '../hooks/useReveal'
import heroImg from '../imports/lux-hero-petroleum.jpg'

interface Props { onNavigate: (page: string) => void }

export default function Vision({ onNavigate }: Props) {
  useReveal()
  return (
    <div style={{ fontFamily: 'Poppins, sans-serif', background: '#fff' }}>
      <PublicNav current="vision" onNavigate={onNavigate} />

      <section style={{ position: 'relative', height: '60vh', minHeight: 420, overflow: 'hidden' }}>
        <img src={heroImg} alt="Industrial pipe corridor" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.78)' }} />
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1260, margin: '0 auto', padding: '0 28px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: 72 }}>
          <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 20 }}>USE · SHEET 04 · STRATEGIC DIRECTION</div>
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', maxWidth: 680 }}>
            Vision & Mission
          </h1>
        </div>
      </section>

      <section style={{ padding: '80px 28px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, marginBottom: 72 }}>
            <div className="reveal-left" style={{ background: palette.accentLight, border: `1px solid #FED7AA`, borderRadius: 20, padding: '48px 40px' }}>
              <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 20 }}>OUR VISION</div>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: palette.navy, letterSpacing: '-0.02em', marginBottom: 20, lineHeight: 1.2 }}>
                To be the MENA region's most trusted corrosion engineering partner.
              </h2>
              <p style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8 }}>
                We envision a region where energy infrastructure operates at its engineered design life — where no pipeline fails prematurely because the right corrosion-control system was unavailable, unaffordable, or poorly applied.
              </p>
            </div>
            <div className="reveal-right" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 20, padding: '48px 40px' }}>
              <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 20 }}>OUR MISSION</div>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: palette.navy, letterSpacing: '-0.02em', marginBottom: 20, lineHeight: 1.2 }}>
                Deliver certified corrosion-control solutions with zero compromise on quality.
              </h2>
              <p style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8 }}>
                Our mission is to protect the infrastructure that powers the region — by applying rigorous engineering, qualified materials, and certified workmanship to every project, regardless of scale or location.
              </p>
            </div>
          </div>

          <div className="reveal">
            <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 40, textAlign: 'center' }}>STRATEGIC PILLARS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
              {[
                { n: '01', title: 'Technical Excellence', desc: 'Every engineer, inspector, and applicator at USE is trained to international standards. We do not compromise on competence.' },
                { n: '02', title: 'Regional Presence', desc: 'Local engineering knowledge combined with international standards — deployed across Egypt, Iraq, KSA, and UAE.' },
                { n: '03', title: 'Integrated Capability', desc: 'Factory manufacturing and field application under one management system, ensuring quality continuity from mill to installed asset.' },
                { n: '04', title: 'Client Partnership', desc: 'We embed in our clients\' project teams, offering engineering support from concept through commissioning and beyond.' },
              ].map((p, i) => (
                <div key={p.n} className="reveal" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '28px 24px', transitionDelay: `${i * 0.08}s` }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#F1F5F9', lineHeight: 1, marginBottom: 16 }}>{p.n}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: palette.navy, marginBottom: 10 }}>{p.title}</div>
                  <div style={{ fontSize: 13, color: palette.muted, lineHeight: 1.7 }}>{p.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
