'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { palette } from '../theme'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'
import { useReveal } from '../hooks/useReveal'

interface Props { onNavigate: (page: string) => void }

const ROLE_KEYS = ['eng01', 'ops02', 'qc03', 'ops04', 'hse05', 'com06'] as const
const ROLE_META: Record<(typeof ROLE_KEYS)[number], { id: string; type: 'Permanent' | 'Contract' }> = {
  eng01: { id: 'USE-ENG-01', type: 'Permanent' },
  ops02: { id: 'USE-OPS-02', type: 'Permanent' },
  qc03: { id: 'USE-QC-03', type: 'Permanent' },
  ops04: { id: 'USE-OPS-04', type: 'Contract' },
  hse05: { id: 'USE-HSE-05', type: 'Permanent' },
  com06: { id: 'USE-COM-06', type: 'Permanent' },
}

export default function Careers({ onNavigate }: Props) {
  useReveal()
  const t = useTranslations('careers')
  const [filter, setFilter] = useState<'All' | 'Permanent' | 'Contract'>('All')

  const types: ('All' | 'Permanent' | 'Contract')[] = ['All', 'Permanent', 'Contract']
  const typeLabel = (type: 'All' | 'Permanent' | 'Contract') =>
    type === 'All' ? t('filterAll') : type === 'Permanent' ? t('typePermanent') : t('typeContract')

  const filtered = filter === 'All' ? ROLE_KEYS : ROLE_KEYS.filter((k) => ROLE_META[k].type === filter)

  return (
    <div style={{ fontFamily: 'Poppins, sans-serif', background: '#fff' }}>
      <PublicNav current="careers" onNavigate={onNavigate} />

      <section style={{ background: palette.navy, padding: '120px 28px 80px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: '#475569', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 20 }}>{t('eyebrow')}</div>
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', maxWidth: 640, lineHeight: 1.05, marginBottom: 20 }}>
            {t('title')}
          </h1>
          <p style={{ fontSize: 17, color: '#94A3B8', maxWidth: 500, lineHeight: 1.7 }}>
            {t('subtitle')}
          </p>
        </div>
      </section>

      <section style={{ padding: '72px 28px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto' }}>
          {/* Filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 40 }}>
            {types.map((type) => (
              <button key={type} onClick={() => setFilter(type)} style={{ background: filter === type ? palette.accent : '#F8FAFC', color: filter === type ? '#fff' : palette.slate, border: `1.5px solid ${filter === type ? palette.accent : '#E2E8F0'}`, borderRadius: 9999, padding: '8px 20px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'all 0.15s' }}>
                {typeLabel(type)}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map((key, i) => (
              <div key={key} className="reveal" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, padding: '24px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, transitionDelay: `${i * 0.05}s`, transition: 'box-shadow 0.2s, transform 0.2s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 24px rgba(0,0,0,0.06)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.transform = 'none' }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: palette.accent, background: palette.accentLight, borderRadius: 4, padding: '2px 8px', letterSpacing: '0.08em' }}>{ROLE_META[key].id}</span>
                    <span style={{ fontSize: 12, color: palette.muted }}>{t(`roles.${key}.dept` as any)}</span>
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: palette.navy, marginBottom: 4 }}>{t(`roles.${key}.title` as any)}</div>
                  <div style={{ fontSize: 13, color: palette.muted }}>📍 {t(`roles.${key}.location` as any)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: ROLE_META[key].type === 'Permanent' ? '#059669' : '#EA580C', background: ROLE_META[key].type === 'Permanent' ? '#ECFDF5' : palette.accentLight, borderRadius: 9999, padding: '4px 12px' }}>
                    {typeLabel(ROLE_META[key].type)}
                  </span>
                  <button
                    onClick={() => onNavigate('candidate-signup')}
                    style={{ background: '#4B5563', color: '#fff', border: 'none', borderRadius: 9999, padding: '10px 22px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif', transition: 'background 0.2s' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#374151' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#4B5563' }}
                  >
                    {t('applyNow')}
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
