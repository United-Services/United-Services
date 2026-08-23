"use client"
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import Image from "next/image"
import PublicNav from "../components/PublicNav"
import PublicFooter from "../components/PublicFooter"
import { useReveal } from "../hooks/useReveal"
import { INK, PAPER, TEXT, MUTED, HEAD, BODY } from "../lib/publicTheme"
import dynamic from "next/dynamic"
// See views/About.tsx for why this is dynamic — same heavy, WebGL-only,
// purely decorative dependency.
const RegionGlobe3D = dynamic(() => import("../components/three/RegionGlobe3D"), { ssr: false })
const headerImg = "/images/LD-01.png"

const adnocLogo = "/images/adnoc.png"
const bpLogo = "/images/bp.png"
const eniLogo = "/images/eni.png"
const petrobelLogo = "/images/petrobel.png"
const apacheLogo = "/images/apache.png"
const bapetcoLogo = "/images/bapetco.png"
const khaldaLogo = "/images/khalda.png"
const agibaLogo = "/images/agiba.png"
const ososcoLogo = "/images/osoco.png"
const daraLogo = "/images/dara.png"
const shellLogo = "/images/shell.png"
const qarunLogo = "/images/qarun.png"
const qpLogo = "/images/qp.png"
const westLogo = "/images/west.png"
const petrosilahLogo = "/images/petrosilah.png"

interface Props {
  onNavigate: (page: string, param?: string) => void
  company?: string | null
}

const IMG = {
  pipes:
    "https://images.unsplash.com/photo-1764835746713-34a671e73569?w=900&q=80",
  weld: "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=900&q=80",
  coating:
    "https://images.unsplash.com/photo-1678984239420-43cdc183bce6?w=900&q=80",
  hdpe: "https://images.unsplash.com/photo-1684667273934-e5d39307eeae?w=900&q=80",
  rtp: "https://images.unsplash.com/photo-1758965364875-e090e5423d2d?w=900&q=80",
  refinery:
    "https://images.unsplash.com/photo-1602860109208-613d39362844?w=900&q=85",
  desert:
    "https://images.unsplash.com/photo-1586057285471-2f78bffaf074?w=900&q=85",
}

interface Company {
  slug: string
  name: string
  logo?: string
  projects: {
    key: string
    tag: string
    year: string
    img: string
  }[]
}

const COMPANIES: Company[] = [
  {
    slug: "adnoc",
    name: "ADNOC",
    logo: adnocLogo,
    projects: [
      { key: "p1", tag: "gre", year: "2022", img: IMG.pipes },
      { key: "p2", tag: "wrap", year: "2021", img: IMG.weld },
    ],
  },
  {
    slug: "bp",
    name: "BP",
    logo: bpLogo,
    projects: [
      { key: "p1", tag: "coating", year: "2023", img: IMG.coating },
      { key: "p2", tag: "hdpe", year: "2020", img: IMG.hdpe },
    ],
  },
  {
    slug: "eni",
    name: "ENI",
    logo: eniLogo,
    projects: [
      { key: "p1", tag: "rtp", year: "2022", img: IMG.rtp },
      { key: "p2", tag: "rtv", year: "2021", img: IMG.refinery },
    ],
  },
  {
    slug: "petrobel",
    name: "Petrobel",
    logo: petrobelLogo,
    projects: [
      { key: "p1", tag: "gre", year: "2019", img: IMG.pipes },
      { key: "p2", tag: "wrap", year: "2020", img: IMG.weld },
    ],
  },
  {
    slug: "apache",
    name: "Apache",
    logo: apacheLogo,
    projects: [
      { key: "p1", tag: "coating", year: "2023", img: IMG.coating },
      { key: "p2", tag: "hdpe", year: "2021", img: IMG.hdpe },
    ],
  },
  {
    slug: "bapetco",
    name: "Bapetco",
    logo: bapetcoLogo,
    projects: [
      { key: "p1", tag: "rtp", year: "2022", img: IMG.rtp },
      { key: "p2", tag: "gre", year: "2020", img: IMG.pipes },
    ],
  },
  {
    slug: "khalda",
    name: "Khalda",
    logo: khaldaLogo,
    projects: [
      { key: "p1", tag: "coating", year: "2021", img: IMG.coating },
      { key: "p2", tag: "wrap", year: "2019", img: IMG.weld },
    ],
  },
  {
    slug: "agiba",
    name: "Agiba",
    logo: agibaLogo,
    projects: [
      { key: "p1", tag: "gre", year: "2022", img: IMG.pipes },
      { key: "p2", tag: "rtv", year: "2020", img: IMG.refinery },
    ],
  },
  {
    slug: "osoco",
    name: "OSOCO",
    logo: ososcoLogo,
    projects: [
      { key: "p1", tag: "coating", year: "2021", img: IMG.coating },
      { key: "p2", tag: "hdpe", year: "2019", img: IMG.hdpe },
    ],
  },
  {
    slug: "dara",
    name: "Dara",
    logo: daraLogo,
    projects: [{ key: "p1", tag: "rtp", year: "2023", img: IMG.rtp }],
  },
  {
    slug: "shell",
    name: "Shell",
    logo: shellLogo,
    projects: [{ key: "p1", tag: "coating", year: "2020", img: IMG.coating }],
  },
  {
    slug: "qarun",
    name: "Qarun",
    logo: qarunLogo,
    projects: [{ key: "p1", tag: "wrap", year: "2021", img: IMG.weld }],
  },
  {
    slug: "qp",
    name: "QP",
    logo: qpLogo,
    projects: [{ key: "p1", tag: "gre", year: "2022", img: IMG.pipes }],
  },
  {
    slug: "west",
    name: "West",
    logo: westLogo,
    projects: [{ key: "p1", tag: "hdpe", year: "2020", img: IMG.hdpe }],
  },
  {
    slug: "petrosilah",
    name: "Petrosilah",
    logo: petrosilahLogo,
    projects: [{ key: "p1", tag: "rtv", year: "2019", img: IMG.refinery }],
  },
]

export default function Projects({ onNavigate, company }: Props) {
  useReveal()
  const t = useTranslations("projects")
  const tSvc = useTranslations("services.names")
  const [filter, setFilter] = useState<string | null>(company ?? null)
  // `filter` starts from `company` but the user can then override it by
  // clicking a company card (setFilter below) — so it can't be purely
  // derived from the prop. Re-syncing it whenever `company` changes via an
  // effect would cause an extra render after the one that already updated
  // `company`; adjusting it directly during render (React's documented
  // pattern for this) applies the reset in the same render instead.
  const [prevCompany, setPrevCompany] = useState(company)
  if (company !== prevCompany) {
    setPrevCompany(company)
    setFilter(company ?? null)
  }

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [company])

  const visible = filter
    ? COMPANIES.filter((c) => c.name === filter)
    : COMPANIES

  return (
    <div style={{ fontFamily: BODY, background: PAPER, color: TEXT }}>
      <PublicNav current="projects" onNavigate={onNavigate} />

      <section
        style={{
          position: "relative",
          paddingTop: 68,
          background: INK,
          padding: "120px 28px 80px",
          overflow: "hidden",
        }}
      >
        <Image
          src={headerImg}
          alt="Industrial pipe corridor"
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover", opacity: 0.4 }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(10,10,12,0.7), rgba(10,10,12,0.96))",
          }}
        />
        <div
          className="projects-globe-accent"
          style={{ position: "absolute", top: "50%", right: "6%", width: 260, height: 260, transform: "translateY(-50%)" }}
        >
          <RegionGlobe3D />
        </div>
        <div
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: 1260,
            margin: "0 auto",
          }}
        >
          <h1
            style={{
              fontFamily: HEAD,
              fontSize: "clamp(36px, 5vw, 64px)",
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.02em",
              marginBottom: 20,
              maxWidth: 700,
            }}
          >
            {filter ? t("titleWithCompany", { company: filter }) : t("title")}
          </h1>
          <p
            style={{
              fontSize: 17,
              color: "#A9A9A9",
              maxWidth: 560,
              lineHeight: 1.7,
            }}
          >
            {filter
              ? t("subtitleWithCompany", { company: filter })
              : t("subtitle")}
          </p>
          {filter && (
            <button
              onClick={() => onNavigate("projects")}
              style={{
                marginTop: 28,
                background: "rgba(255,255,255,0.1)",
                color: "#fff",
                border: "1.5px solid rgba(255,255,255,0.3)",
                borderRadius: 9999,
                padding: "10px 24px",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: BODY,
              }}
            >
              {t("viewAllClients")}
            </button>
          )}
        </div>
      </section>

      {!filter && (
        <section
          style={{
            background: "#fff",
            padding: "48px 28px",
            borderBottom: "1px solid #E6E5E0",
          }}
        >
          <div
            style={{
              maxWidth: 1260,
              margin: "0 auto",
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              justifyContent: "center",
            }}
          >
            {COMPANIES.map((c) => (
              <button
                key={c.name}
                onClick={() => setFilter(c.name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: PAPER,
                  border: "1px solid #E6E5E0",
                  borderRadius: 9999,
                  padding: "8px 18px",
                  cursor: "pointer",
                  fontFamily: BODY,
                  fontSize: 13,
                  fontWeight: 600,
                  color: MUTED,
                }}
              >
                {c.logo && (
                  <img
                    src={c.logo}
                    alt={c.name}
                    style={{ height: 16, width: "auto", objectFit: "contain" }}
                  />
                )}
                {c.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section style={{ padding: "80px 28px" }}>
        <div
          style={{
            maxWidth: 1260,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 64,
          }}
        >
          {visible.map((c) => (
            <div key={c.name} className="reveal">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginBottom: 24,
                  paddingBottom: 16,
                  borderBottom: "1px solid #E6E5E0",
                }}
              >
                {c.logo && (
                  <img
                    src={c.logo}
                    alt={c.name}
                    style={{ height: 32, width: "auto", objectFit: "contain" }}
                  />
                )}
                <div>
                  <div
                    style={{
                      fontFamily: HEAD,
                      fontSize: 20,
                      fontWeight: 700,
                      color: TEXT,
                    }}
                  >
                    {c.name}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED }}>
                    {t(`companies.${c.slug}.region` as any)}
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                  gap: 24,
                }}
              >
                {c.projects.map((p) => (
                  <div
                    key={p.key}
                    style={{
                      border: "1px solid #E6E5E0",
                      borderRadius: 16,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    <div style={{ position: "relative", width: "100%", aspectRatio: "16/9" }}>
                      <Image
                        src={p.img}
                        alt={t(
                          `companies.${c.slug}.projects.${p.key}.title` as any,
                        )}
                        fill
                        sizes="(max-width: 900px) 100vw, 320px"
                        style={{ objectFit: "cover" }}
                      />
                    </div>
                    <div style={{ padding: "20px 22px" }}>
                      <div
                        style={{
                          fontFamily: "ui-monospace,monospace",
                          fontSize: 11,
                          color: TEXT,
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          marginBottom: 8,
                        }}
                      >
                        {tSvc(p.tag as any)} · {p.year}
                      </div>
                      <div
                        style={{
                          fontFamily: HEAD,
                          fontSize: 16,
                          fontWeight: 600,
                          color: TEXT,
                          marginBottom: 8,
                        }}
                      >
                        {t(
                          `companies.${c.slug}.projects.${p.key}.title` as any,
                        )}
                      </div>
                      <p
                        style={{
                          fontSize: 13,
                          color: MUTED,
                          lineHeight: 1.6,
                        }}
                      >
                        {t(`companies.${c.slug}.projects.${p.key}.desc` as any)}
                      </p>
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
