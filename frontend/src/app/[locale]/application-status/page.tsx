'use client'

import { palette } from '@/theme'
import PublicNav from '@/components/PublicNav'
import PublicFooter from '@/components/PublicFooter'
import { useAppNavigate } from '@/lib/navigate'

export default function ApplicationStatusPage() {
  const navigate = useAppNavigate()

  return (
    <div style={{ fontFamily: 'Poppins, sans-serif', background: '#fff' }}>
      <PublicNav current="" onNavigate={navigate} />
      <div style={{ height: 68 }} />
      <section style={{ padding: '96px 28px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>
            USE · CANDIDATE PORTAL
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: palette.navy, marginBottom: 16 }}>
            Application received
          </h1>
          <p style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8 }}>
            Thank you for applying to United Services Egypt. Our HR team reviews every application by hand — we'll
            reach out by email once a decision has been made. There's no candidate dashboard to check back on; you're
            all set.
          </p>
        </div>
      </section>
      <PublicFooter onNavigate={navigate} />
    </div>
  )
}
