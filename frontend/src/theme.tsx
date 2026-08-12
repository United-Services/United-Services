import type React from 'react'

// Orange accent locked per brief
export const palette = {
  accent: '#EA580C',
  accentDark: '#C2410C',
  accentLight: '#FFF7ED',
  navy: '#0F172A',
  slate: '#334155',
  muted: '#64748B',
  border: '#E2E8F0',
  bg: '#FFFFFF',
  bgAlt: '#F8FAFC',
}

export const btnPrimary: React.CSSProperties = {
  background: '#EA580C',
  color: '#fff',
  border: 'none',
  borderRadius: 9999,
  padding: '13px 32px',
  fontWeight: 700,
  fontSize: 15,
  cursor: 'pointer',
  fontFamily: 'Poppins, sans-serif',
  transition: 'background 0.2s, box-shadow 0.2s',
  display: 'inline-block',
}

export const btnGrey: React.CSSProperties = {
  background: '#4B5563',
  color: '#fff',
  border: 'none',
  borderRadius: 9999,
  padding: '13px 32px',
  fontWeight: 600,
  fontSize: 15,
  cursor: 'pointer',
  fontFamily: 'Poppins, sans-serif',
  transition: 'background 0.2s, box-shadow 0.2s',
  display: 'inline-block',
}

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 16px',
  borderRadius: 14,
  border: '1.5px solid #E2E8F0',
  fontSize: 15,
  color: '#0F172A',
  background: '#fff',
  outline: 'none',
  transition: 'border-color 0.2s',
  boxSizing: 'border-box' as const,
  fontFamily: 'Poppins, sans-serif',
}
