import { useState } from 'react'
import { palette } from '../theme'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'
import { useReveal } from '../hooks/useReveal'

interface Props { onNavigate: (page: string) => void }

const ROLES = [
  { title: 'Senior Corrosion Engineer', dept: 'Engineering', location: 'Cairo, Egypt', type: 'Permanent', id: 'USE-ENG-01' },
  { title: 'GRE Lining Applicator – Level 3', dept: 'Operations', location: 'Cairo Factory', type: 'Permanent', id: 'USE-OPS-02' },
  { title: 'QC Inspector (NACE Level II)', dept: 'Quality', location: 'Cairo / Field', type: 'Permanent', id: 'USE-QC-03' },
  { title: 'Field Coating Supervisor', dept: 'Operations', location: 'Iraq / KSA', type: 'Contract', id: 'USE-OPS-04' },
  { title: 'HSE Officer', dept: 'Health & Safety', location: 'Cairo, Egypt', type: 'Permanent', id: 'USE-HSE-05' },
  { title: 'Business Development Engineer – Gulf', dept: 'Commercial', location: 'UAE / Remote', type: 'Permanent', id: 'USE-COM-06' },
]

export default function Careers({ onNavigate }: Props) {
  useReveal()
  const [filter, setFilter] = useState('All')

  const types = ['All', 'Permanent', 'Contract']
  const filtered = filter === 'All' ? ROLES : ROLES.filter((r) => r.type === filter)

  return (
    <div style={{ fontFamily: 'Poppins, sans-serif', background: '#fff' }}>
      <PublicNav current="careers" onNavigate={onNavigate} />

      <section style={{ background: palette.navy, padding: '120px 28px 80px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 20 }}>USE · SHEET 05 · CAREERS</div>
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', maxWidth: 640, lineHeight: 1.05, marginBottom: 20 }}>
            Join the team that protects the region's infrastructure.
          </h1>
          <p style={{ fontSize: 17, color: '#94A3B8', maxWidth: 500, lineHeight: 1.7 }}>
            USE looks for engineers and technicians who take quality seriously. We offer international-standard training, API/ISO-certified work environments, and projects that matter.
          </p>
        </div>
      </section>

      <section style={{ padding: '72px 28px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto' }}>
          {/* Filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 40 }}>
            {types.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{ background: filter === t ? palette.accent : '#F8FAFC', color: filter === t ? '#fff' : palette.slate, border: `1.5px solid ${filter === t ? palette.accent : '#E2E8F0'}`, borderRadius: 9999, padding: '8px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'all 0.15s' }}>
                {t}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((r, i) => (
              <div key={r.id} className="reveal" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, transitionDelay: `${i * 0.05}s`, transition: 'box-shadow 0.2s, transform 0.2s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 24px rgba(0,0,0,0.06)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.transform = 'none' }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: palette.accent, background: palette.accentLight, borderRadius: 4, padding: '2px 8px', letterSpacing: '0.08em' }}>{r.id}</span>
                    <span style={{ fontSize: 12, color: palette.muted }}>{r.dept}</span>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: palette.navy, marginBottom: 4 }}>{r.title}</div>
                  <div style={{ fontSize: 13, color: palette.muted }}>📍 {r.location}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: r.type === 'Permanent' ? '#059669' : '#EA580C', background: r.type === 'Permanent' ? '#ECFDF5' : palette.accentLight, borderRadius: 9999, padding: '4px 12px' }}>
                    {r.type}
                  </span>
                  <button
                    onClick={() => onNavigate('candidate-signup')}
                    style={{ background: '#4B5563', color: '#fff', border: 'none', borderRadius: 9999, padding: '10px 22px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'background 0.2s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#374151' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#4B5563' }}
                  >
                    Apply Now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
