"use client" /* Logo */ /* Desktop links — hidden under 860px, see .public-nav-desktop in globals.css */ /* Desktop actions — hidden under 860px */ /* Mobile hamburger — only shown under 860px */ /* Mobile panel */
import { useState } from "react"
import { useTranslations } from "next-intl"
import { useUser } from "@clerk/nextjs"
import { palette } from "../theme"
import LanguageSwitcher from "./LanguageSwitcher"
const navLogo = "/images/logo-nav-future-energy.png"

interface Props {
  current: string
  onNavigate: (page: string, param?: string) => void
}

const LINK_IDS = [
  "about",
  "vision",
  "services",
  "projects",
  "careers",
  "contact",
] as const

export default function PublicNav({ current, onNavigate }: Props) {
  const t = useTranslations("nav")
  const [menuOpen, setMenuOpen] = useState(false)
  const { isSignedIn } = useUser()

  const go = (page: string) => {
    setMenuOpen(false)
    onNavigate(page)
  }

  // /dashboard re-derives the role from our own DB and redirects to the
  // right portal — signed-out visitors land on the unified sign-in page,
  // which itself redirects to /dashboard once authenticated.
  const portalLabel = isSignedIn ? t("clientPortal") : t("logIn")
  const portalTarget = isSignedIn ? "dashboard" : "client-login"

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "rgba(255,255,255,0.97)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #F1F5F9",
      }}
    >
      <div
        style={{
          maxWidth: 1260,
          margin: "0 auto",
          padding: "0 28px",
          height: 68,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {}
        <button
          onClick={() => go("home")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: 0,
            flexShrink: 0,
          }}
        >
          <img
            src={navLogo}
            alt="United Services Egypt"
            style={{ height: 40, width: "auto", objectFit: "contain" }}
          />
        </button>

        {}
        <div
          className="public-nav-desktop"
          style={{ alignItems: "center", gap: 2 }}
        >
          {LINK_IDS.map((id) => (
            <button
              key={id}
              onClick={() => go(id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: current === id ? 700 : 500,
                color: current === id ? palette.accent : palette.slate,
                borderRadius: 8,
                fontFamily: "Poppins, sans-serif",
                transition: "color 0.15s",
              }}
            >
              {t(id)}
            </button>
          ))}
        </div>

        {}
        <div
          className="public-nav-desktop"
          style={{ gap: 10, alignItems: "center" }}
        >
          <LanguageSwitcher />
          <button
            onClick={() => go(portalTarget)}
            style={{
              background: "#F8FAFC",
              color: palette.navy,
              border: "1.5px solid #E2E8F0",
              borderRadius: 9999,
              padding: "9px 22px",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            {portalLabel}
          </button>
        </div>

        {}
        <button
          className="public-nav-toggle"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={t("menuToggle")}
          aria-expanded={menuOpen}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 8,
            flexShrink: 0,
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={palette.navy}
            strokeWidth="2"
            strokeLinecap="round"
          >
            {menuOpen ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {}
      {menuOpen && (
        <div
          className="public-nav-mobile-panel"
          style={{
            borderTop: "1px solid #F1F5F9",
            background: "#fff",
            padding: "12px 20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {LINK_IDS.map((id) => (
            <button
              key={id}
              onClick={() => go(id)}
              style={{
                background: current === id ? palette.accentLight : "none",
                border: "none",
                cursor: "pointer",
                padding: "12px 14px",
                fontSize: 15,
                textAlign: "start",
                fontWeight: current === id ? 700 : 500,
                color: current === id ? palette.accent : palette.slate,
                borderRadius: 10,
                fontFamily: "Poppins, sans-serif",
              }}
            >
              {t(id)}
            </button>
          ))}
          <div style={{ padding: "10px 14px 4px" }}>
            <LanguageSwitcher />
          </div>
          <button
            onClick={() => go(portalTarget)}
            style={{
              background: "#F8FAFC",
              color: palette.navy,
              border: "1.5px solid #E2E8F0",
              borderRadius: 9999,
              padding: "12px 22px",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
              marginTop: 8,
            }}
          >
            {portalLabel}
          </button>
        </div>
      )}
    </nav>
  )
}
