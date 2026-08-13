'use client'
import { palette } from '../theme'
const footerLogo = '/images/logo-footer.png'

interface Props { onNavigate: (page: string) => void }

const CERTS = ['API Q1', 'ISO 9001 · DNV', 'ISO 14001', 'ISO 45001', 'EGPC Registered']

export default function PublicFooter({ onNavigate }: Props) {
  return (
    <footer style={{ background: palette.navy, color: '#fff', padding: '64px 28px 32px' }}>
      <div style={{ maxWidth: 1260, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 48, marginBottom: 56 }}>
          {/* Brand */}
          <div>
            <div style={{ marginBottom: 20 }}>
              <img src={footerLogo} alt="United Services Egypt" style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
            </div>
            <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.7, maxWidth: 300, marginBottom: 24 }}>
              Corrosion control and pipeline integrity solutions for the oil & gas industry across Egypt, Iraq, Saudi Arabia, and the UAE.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CERTS.map((c) => (
                <span key={c} style={{ fontSize: 11, fontWeight: 600, color: palette.accent, background: 'rgba(234,88,12,0.12)', borderRadius: 6, padding: '4px 10px', letterSpacing: '0.04em' }}>
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Company */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Company</div>
            {['about', 'vision', 'careers', 'contact'].map((p) => (
              <button key={p} onClick={() => onNavigate(p)} style={{ display: 'block', background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: 14, padding: '6px 0', fontFamily: 'Poppins, sans-serif', textTransform: 'capitalize' }}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>

          {/* Services */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Services</div>
            {['GRE Tubular Lining', 'External Wrapping', 'Industrial Coating', 'HDPE Lining', 'RTP Systems', 'RTV Insulator Coating'].map((s) => (
              <button key={s} onClick={() => onNavigate('services')} style={{ display: 'block', background: 'none', border: 'none', cursor: 'pointer', color: '#CBD5E1', fontSize: 13, padding: '5px 0', fontFamily: 'Poppins, sans-serif', textAlign: 'left' }}>
                {s}
              </button>
            ))}
          </div>

          {/* Contact */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Contact</div>
            <div style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.8 }}>
              <div>14S Building, El Oroba Street Extension</div>
              <div style={{ color: '#94A3B8', fontSize: 12, marginBottom: 8 }}>New Maadi, Cairo, Egypt</div>
              <a href="tel:+20227033656" style={{ display: 'block', color: '#CBD5E1', textDecoration: 'none' }}>Tel: (+2) 0227033656</a>
              <div style={{ color: '#94A3B8', fontSize: 12, marginBottom: 8 }}>Fax: (+2) 0227033656</div>
              <a href="mailto:info@use-eg.com" style={{ color: palette.accent, textDecoration: 'none' }}>info@use-eg.com</a>
              <div style={{ marginTop: 16, fontSize: 12, color: '#64748B' }}>Also operating in:</div>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>Iraq · Saudi Arabia · UAE</div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #1E293B', paddingTop: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ fontSize: 13, color: '#475569' }}>
            © 2026 United Services Egypt. All rights reserved. · EGPC Registered
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            {['Privacy Policy', 'Terms of Service'].map((l) => (
              <span key={l} style={{ fontSize: 13, color: '#475569', cursor: 'pointer' }}>{l}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
