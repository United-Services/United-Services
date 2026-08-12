import { useEffect, useState } from 'react'
import { palette } from '../theme'
import PublicNav from '../components/PublicNav'
import PublicFooter from '../components/PublicFooter'
import { useReveal } from '../hooks/useReveal'
import headerImg from '../imports/LD-01.png'

import adnocLogo from '../imports/adnoc.png'
import bpLogo from '../imports/bp.png'
import eniLogo from '../imports/eni.png'
import petrobelLogo from '../imports/petrobel.png'
import apacheLogo from '../imports/apache.png'
import bapetcoLogo from '../imports/bapetco.png'
import khaldaLogo from '../imports/khalda.png'
import agibaLogo from '../imports/agiba.png'
import ososcoLogo from '../imports/osoco.png'
import daraLogo from '../imports/dara.png'
import shellLogo from '../imports/shell.png'
import qarunLogo from '../imports/qarun.png'
import qpLogo from '../imports/qp.png'
import westLogo from '../imports/west.png'
import petrosilahLogo from '../imports/petrosilah.png'

interface Props {
  onNavigate: (page: string, param?: string) => void
  company?: string | null
}

const IMG = {
  pipes: 'https://images.unsplash.com/photo-1764835746713-34a671e73569?w=900&q=80',
  weld: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=900&q=80',
  coating: 'https://images.unsplash.com/photo-1678984239420-43cdc183bce6?w=900&q=80',
  hdpe: 'https://images.unsplash.com/photo-1684667273934-e5d39307eeae?w=900&q=80',
  rtp: 'https://images.unsplash.com/photo-1758965364875-e090e5423d2d?w=900&q=80',
  refinery: 'https://images.unsplash.com/photo-1602860109208-613d39362844?w=900&q=85',
  desert: 'https://images.unsplash.com/photo-1586057285471-2f78bffaf074?w=900&q=85',
}

interface Company {
  name: string
  logo?: string
  region: string
  projects: {
    title: string
    tag: string
    year: string
    desc: string
    img: string
  }[]
}

const COMPANIES: Company[] = [
  {
    name: 'ADNOC', logo: adnocLogo, region: 'United Arab Emirates',
    projects: [
      { title: 'Offshore Water Injection Pipeline Lining', tag: 'GRE Tubular Lining', year: '2022', desc: 'Factory-applied GRE lining for water injection flowlines servicing offshore production platforms, engineered for high-salinity produced water service.', img: IMG.pipes },
      { title: 'Onshore Trunkline External Protection', tag: 'External Wrapping', year: '2021', desc: 'Multi-layer tape wrapping system applied to buried onshore trunklines to guard against soil-side corrosion in coastal desert terrain.', img: IMG.weld },
    ],
  },
  {
    name: 'BP', logo: bpLogo, region: 'Gulf of Suez, Egypt',
    projects: [
      { title: 'Gulf of Suez Riser Coating Programme', tag: 'Industrial Coating', year: '2023', desc: 'FBE coating applied to riser and topside piping across a Gulf of Suez production complex, meeting NACE SP0188 requirements.', img: IMG.coating },
      { title: 'Produced Water Reinjection Line', tag: 'HDPE Lining', year: '2020', desc: 'Slip-lined HDPE liner installed inside existing steel pipeline to extend service life of a produced water reinjection system.', img: IMG.hdpe },
    ],
  },
  {
    name: 'ENI', logo: eniLogo, region: 'Nile Delta, Egypt',
    projects: [
      { title: 'Nile Delta Gas Gathering Network', tag: 'RTP Systems', year: '2022', desc: 'Reinforced thermoplastic pipe spooled and installed across a gas gathering network, reducing field joints and accelerating build schedule.', img: IMG.rtp },
      { title: 'Substation Insulator Protection', tag: 'RTV Insulator Coating', year: '2021', desc: 'RTV silicone coating applied to high-voltage insulators at a field substation to reduce flashover risk from desert dust and salt fog.', img: IMG.refinery },
    ],
  },
  {
    name: 'Petrobel', logo: petrobelLogo, region: 'Sinai / Gulf of Suez',
    projects: [
      { title: 'Crude Gathering Line Rehabilitation', tag: 'GRE Tubular Lining', year: '2019', desc: 'GRE lining specified for crude oil gathering lines exposed to H₂S and CO₂ service conditions across a mature field development.', img: IMG.pipes },
      { title: 'Platform Piping External Wrap', tag: 'External Wrapping', year: '2020', desc: 'Heat-shrink sleeve systems applied at pipeline tie-ins and field joints on offshore platform piping.', img: IMG.weld },
    ],
  },
  {
    name: 'Apache', logo: apacheLogo, region: 'Western Desert, Egypt',
    projects: [
      { title: 'Western Desert Flowline Coating', tag: 'Industrial Coating', year: '2023', desc: 'FBE and liquid epoxy coating applied to flowlines connecting wellheads to central processing facilities in the Western Desert concession.', img: IMG.coating },
      { title: 'Chemical Injection Line Upgrade', tag: 'HDPE Lining', year: '2021', desc: 'HDPE-lined chemical transport lines installed to resist corrosive scale inhibitor and biocide chemistries.', img: IMG.hdpe },
    ],
  },
  {
    name: 'Bapetco', logo: bapetcoLogo, region: 'Western Desert, Egypt',
    projects: [
      { title: 'Water Injection Network Expansion', tag: 'RTP Systems', year: '2022', desc: 'RTP pipe systems deployed across an expanding water injection network to manage produced water reinjection at scale.', img: IMG.rtp },
      { title: 'Wellhead Piping Corrosion Barrier', tag: 'GRE Tubular Lining', year: '2020', desc: 'GRE tubular lining applied to wellhead flowlines to arrest internal corrosion in high-chloride produced fluids.', img: IMG.pipes },
    ],
  },
  {
    name: 'Khalda', logo: khaldaLogo, region: 'Western Desert, Egypt',
    projects: [
      { title: 'Central Processing Facility Coating', tag: 'Industrial Coating', year: '2021', desc: 'NACE-compliant coating system applied across process piping at a central gathering and processing facility.', img: IMG.coating },
      { title: 'Buried Pipeline External Protection', tag: 'External Wrapping', year: '2019', desc: 'ISO 21809-3 qualified tape wrap system applied to buried export pipelines in desert soil conditions.', img: IMG.weld },
    ],
  },
  {
    name: 'Agiba', logo: agibaLogo, region: 'Western Desert, Egypt',
    projects: [
      { title: 'Flowline Internal Lining Programme', tag: 'GRE Tubular Lining', year: '2022', desc: 'Multi-well flowline internal lining programme addressing internal corrosion across a mature concession.', img: IMG.pipes },
      { title: 'Insulator Refurbishment', tag: 'RTV Insulator Coating', year: '2020', desc: 'RTV coating applied to field power distribution insulators to extend maintenance intervals.', img: IMG.refinery },
    ],
  },
  {
    name: 'OSOCO', logo: ososcoLogo, region: 'Egypt',
    projects: [
      { title: 'Export Pipeline Coating Upgrade', tag: 'Industrial Coating', year: '2021', desc: 'FBE recoating and repair works on an export pipeline segment identified through corrosion mapping inspection.', img: IMG.coating },
      { title: 'Chemical Line HDPE Retrofit', tag: 'HDPE Lining', year: '2019', desc: 'Existing steel chemical lines retrofitted with HDPE liner to eliminate recurring corrosion failures.', img: IMG.hdpe },
    ],
  },
  {
    name: 'Dara', logo: daraLogo, region: 'Egypt',
    projects: [
      { title: 'Gathering Network RTP Installation', tag: 'RTP Systems', year: '2023', desc: 'RTP systems installed across a low-pressure gathering network, reducing installation time versus conventional steel pipe.', img: IMG.rtp },
    ],
  },
  {
    name: 'Shell', logo: shellLogo, region: 'Egypt',
    projects: [
      { title: 'Downstream Piping Coating Works', tag: 'Industrial Coating', year: '2020', desc: 'Coating works carried out on downstream process piping at a fuel distribution terminal.', img: IMG.coating },
    ],
  },
  {
    name: 'Qarun', logo: qarunLogo, region: 'Western Desert, Egypt',
    projects: [
      { title: 'Flowline External Wrap Programme', tag: 'External Wrapping', year: '2021', desc: 'External wrap protection applied across a wellhead-to-facility flowline network.', img: IMG.weld },
    ],
  },
  {
    name: 'QP', logo: qpLogo, region: 'Qatar',
    projects: [
      { title: 'Onshore Pipeline Lining Study', tag: 'GRE Tubular Lining', year: '2022', desc: 'GRE lining specification and application trials for onshore pipeline sections in corrosive service.', img: IMG.pipes },
    ],
  },
  {
    name: 'West', logo: westLogo, region: 'Egypt',
    projects: [
      { title: 'Produced Water Line Rehabilitation', tag: 'HDPE Lining', year: '2020', desc: 'HDPE slip-lining used to rehabilitate a produced water pipeline nearing end of service life.', img: IMG.hdpe },
    ],
  },
  {
    name: 'Petrosilah', logo: petrosilahLogo, region: 'Egypt',
    projects: [
      { title: 'Wellhead Insulator Coating', tag: 'RTV Insulator Coating', year: '2019', desc: 'RTV silicone coating applied to wellhead-area high-voltage insulators to reduce pollution-related flashover.', img: IMG.refinery },
    ],
  },
]

export default function Projects({ onNavigate, company }: Props) {
  useReveal()
  const [filter, setFilter] = useState<string | null>(company ?? null)

  useEffect(() => {
    setFilter(company ?? null)
    window.scrollTo(0, 0)
  }, [company])

  const visible = filter ? COMPANIES.filter((c) => c.name === filter) : COMPANIES

  return (
    <div style={{ fontFamily: 'Poppins, sans-serif', background: '#fff' }}>
      <PublicNav current="projects" onNavigate={onNavigate} />

      <section style={{ position: 'relative', paddingTop: 68, background: palette.navy, padding: '120px 28px 80px', overflow: 'hidden' }}>
        <img src={headerImg} alt="Industrial pipe corridor" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(15,23,42,0.75), rgba(15,23,42,0.96))' }} />
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 1260, margin: '0 auto' }}>
          <div style={{ fontSize: 11, color: '#94A3B8', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 20 }}>
            USE · SHEET 03 · PROJECT LOG
          </div>
          <h1 style={{ fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginBottom: 20, maxWidth: 700 }}>
            {filter ? `Projects with ${filter}` : 'Projects'}
          </h1>
          <p style={{ fontSize: 17, color: '#94A3B8', maxWidth: 560, lineHeight: 1.7 }}>
            {filter
              ? `A selection of pipeline integrity and corrosion-control work delivered for ${filter}.`
              : 'Pipeline integrity and corrosion-control work delivered for operators across Egypt and the region.'}
          </p>
          {filter && (
            <button
              onClick={() => onNavigate('projects')}
              style={{ marginTop: 28, background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 9999, padding: '10px 24px', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }}
            >
              ← View all clients
            </button>
          )}
        </div>
      </section>

      {!filter && (
        <section style={{ background: '#F8FAFC', padding: '48px 28px', borderBottom: '1px solid #E2E8F0' }}>
          <div style={{ maxWidth: 1260, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {COMPANIES.map((c) => (
              <button
                key={c.name}
                onClick={() => setFilter(c.name)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 9999, padding: '8px 18px', cursor: 'pointer', fontFamily: 'Poppins, sans-serif', fontSize: 13, fontWeight: 600, color: palette.slate }}
              >
                {c.logo && <img src={c.logo} alt={c.name} style={{ height: 16, width: 'auto', objectFit: 'contain' }} />}
                {c.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section style={{ padding: '80px 28px' }}>
        <div style={{ maxWidth: 1260, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 64 }}>
          {visible.map((c) => (
            <div key={c.name} className="reveal">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid #E2E8F0' }}>
                {c.logo && <img src={c.logo} alt={c.name} style={{ height: 32, width: 'auto', objectFit: 'contain' }} />}
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: palette.navy }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: palette.muted }}>{c.region}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                {c.projects.map((p) => (
                  <div key={p.title} style={{ border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden' }}>
                    <img src={p.img} alt={p.title} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }} />
                    <div style={{ padding: '20px 22px' }}>
                      <div style={{ fontSize: 11, color: palette.accent, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
                        {p.tag} · {p.year}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: palette.navy, marginBottom: 8 }}>{p.title}</div>
                      <p style={{ fontSize: 13, color: palette.slate, lineHeight: 1.6 }}>{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
