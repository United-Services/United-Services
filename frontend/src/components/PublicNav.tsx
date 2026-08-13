'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { palette } from '../theme'
import LanguageSwitcher from './LanguageSwitcher'
const navLogo = '/images/logo-nav-future-energy.png'

interface Props {
  current: string
  onNavigate: (page: string, param?: string) => void
}

const LINK_IDS = ['about', 'vision', 'services', 'projects', 'careers', 'contact'] as const

export default function PublicNav({ current, onNavigate }: Props) {
  const t = useTranslations('nav')
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
          {LINK_IDS.map((id) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 14px',
                fontSize: 14,
                fontWeight: current === id ? 700 : 500,
                color: current === id ? palette.accent : palette.slate,
                borderRadius: 8,
                fontFamily: 'Poppins, sans-serif',
                transition: 'color 0.15s',
              }}
            >
              {t(id)}
            </button>
          ))}
        </div>

        {/* Portal button */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <LanguageSwitcher />
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
            {t('clientPortal')}
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
            {t('requestConsultation')}
          </button>
        </div>
      </div>
    </nav>
  )
}
