'use client'
import { useState } from 'react'
import { palette } from '../theme'
const navLogo = '/images/logo-nav-future-energy.png'

interface Props {
  current: string
  onNavigate: (page: string, param?: string) => void
}

const LINKS = [
  { id: 'about', label: 'About' },
  { id: 'vision', label: 'Vision' },
  { id: 'services', label: 'Services' },
  { id: 'projects', label: 'Projects' },
  { id: 'careers', label: 'Careers' },
  { id: 'contact', label: 'Contact' },
]

export default function PublicNav({ current, onNavigate }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #F1F5F9',
      }}
    >
      <div
        style={{
          maxWidth: 1260,
          margin: '0 auto',
          padding: '0 28px',
          height: 68,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo */}
        <button
          onClick={() => onNavigate('home')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: 0 }}
        >
          <img src={navLogo} alt="United Services Egypt" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />
        </button>

        {/* Desktop links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {LINKS.map((l) => (
            <button
              key={l.id}
              onClick={() => onNavigate(l.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 14px',
                fontSize: 14,
                fontWeight: current === l.id ? 700 : 500,
                color: current === l.id ? palette.accent : palette.slate,
                borderRadius: 8,
                fontFamily: 'Poppins, sans-serif',
                transition: 'color 0.15s',
              }}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Portal button */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => onNavigate('client-login')}
            style={{
              background: '#F8FAFC',
              color: palette.navy,
              border: '1.5px solid #E2E8F0',
              borderRadius: 9999,
              padding: '9px 22px',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'Poppins, sans-serif',
            }}
          >
            Client Portal
          </button>
          <button
            onClick={() => onNavigate('contact')}
            style={{
              background: palette.accent,
              color: '#fff',
              border: 'none',
              borderRadius: 9999,
              padding: '9px 22px',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              fontFamily: 'Poppins, sans-serif',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = palette.accentDark }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = palette.accent }}
          >
            Request Consultation
          </button>
        </div>
      </div>
    </nav>
  )
}
