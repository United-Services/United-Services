'use client'
import { useState } from 'react'
import { palette, inputStyle } from '../theme'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'

interface Props { onNavigate: (page: string) => void }

export default function Contact({ onNavigate }: Props) {
  const [form, setForm] = useState({ name: '', email: '', company: '', service: '', message: '' })
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => { setLoading(false); setSent(true) }, 900)
  }

  return (
    <div style={{ fontFamily: 'Poppins, sans-serif', background: '#fff' }}>
      <PublicNav current="contact" onNavigate={onNavigate} />
      <div style={{ height: 68 }} />

      <section style={{ padding: '72px 28px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 80 }}>
          {/* Info */}
          <div>
            <div style={{ fontSize: 11, color: palette.accent, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>USE · ENGAGEMENT</div>
            <h1 style={{ fontSize: 42, fontWeight: 800, color: palette.navy, letterSpacing: '-0.03em', marginBottom: 20, lineHeight: 1.1 }}>Request a Consultation</h1>
            <p style={{ fontSize: 15, color: palette.slate, lineHeight: 1.8, marginBottom: 40 }}>
              Speak with a USE engineer about your application. We'll respond within one business day.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {[
                { icon: '📍', label: 'Headquarters', value: 'Cairo, Egypt · 6,000 m² Facility' },
                { icon: '✉️', label: 'Email', value: 'info@use-eg.com' },
                { icon: '🌍', label: 'Operations', value: 'Egypt · Iraq · Saudi Arabia · UAE' },
              ].map((c) => (
                <div key={c.label} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: palette.accentLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    {c.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: palette.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</div>
                    <div style={{ fontSize: 14, color: palette.navy, fontWeight: 600, marginTop: 2 }}>{c.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Form */}
          {sent ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F0FDF4', borderRadius: 24, padding: '60px 48px', border: '1px solid #BBF7D0', textAlign: 'center' }}>
              <div style={{ fontSize: 52, marginBottom: 20 }}>✓</div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: '#166534', marginBottom: 12 }}>Message Sent</h2>
              <p style={{ fontSize: 15, color: '#15803D', lineHeight: 1.7 }}>
                Thank you, {form.name.split(' ')[0]}. A USE engineer will contact you at <strong>{form.email}</strong> within one business day.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ background: '#F8FAFC', borderRadius: 24, padding: '48px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Full Name</label>
                  <input value={form.name} onChange={set('name')} placeholder="Your full name" required style={inputStyle}
                    onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Email Address</label>
                  <input type="email" value={form.email} onChange={set('email')} placeholder="Your work email address" required style={inputStyle}
                    onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Company / Operator</label>
                <input value={form.company} onChange={set('company')} placeholder="Name of your company or operating entity" required style={inputStyle}
                  onFocus={(e) => { e.target.style.borderColor = palette.accent }} onBlur={(e) => { e.target.style.borderColor = '#E2E8F0' }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Service of Interest</label>
                <select value={form.service} onChange={set('service')} required style={{ ...inputStyle, appearance: 'none' }}
                  onFocus={(e) => { (e.target as HTMLSelectElement).style.borderColor = palette.accent }} onBlur={(e) => { (e.target as HTMLSelectElement).style.borderColor = '#E2E8F0' }}>
                  <option value="">Select a service area</option>
                  <option>GRE Tubular Lining</option>
                  <option>External Wrapping</option>
                  <option>Industrial Coating</option>
                  <option>HDPE Lining</option>
                  <option>RTP Systems</option>
                  <option>RTV Insulator Coating</option>
                  <option>General Enquiry</option>
                </select>
              </div>
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>Project Description</label>
                <textarea value={form.message} onChange={set('message')} placeholder="Describe your pipeline system, operating conditions, and what you need" required rows={5}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 120 }}
                  onFocus={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = palette.accent }} onBlur={(e) => { (e.target as HTMLTextAreaElement).style.borderColor = '#E2E8F0' }} />
              </div>
              <button type="submit" disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: 9999, border: 'none', background: loading ? '#9CA3AF' : palette.accent, color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}>
                {loading ? 'Sending…' : 'Send Consultation Request'}
              </button>
            </form>
          )}
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
