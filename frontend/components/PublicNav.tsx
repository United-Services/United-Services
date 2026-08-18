"use client" /* Logo */ /* Desktop links — hidden under 860px, see .public-nav-desktop in globals.css */ /* Desktop actions — hidden under 860px */ /* Mobile hamburger — only shown under 860px */ /* Mobile panel */
import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { useUser } from "@clerk/nextjs"
import LanguageSwitcher from "./LanguageSwitcher"
import { PAPER, TEXT, MUTED, LIME, BODY } from "../lib/publicTheme"
const navLogo = "/images/logo-nav-future-energy.png"

interface Props {
  current: string
  onNavigate: (page: string, param?: string) => void
  // Petrova reference: nav sits directly on the hero photo with no
  // background, then picks up the normal solid/blurred treatment once
  // the visitor scrolls past it. Only Home's hero passes this.
  transparentOverHero?: boolean
}

const LINK_IDS = [
  "about",
  "vision",
  "services",
  "projects",
  "careers",
  "contact",
] as const

export default function PublicNav({ current, onNavigate, transparentOverHero }: Props) {
  const t = useTranslations("nav")
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(!transparentOverHero)
  const { isSignedIn } = useUser()

  useEffect(() => {
    if (!transparentOverHero) return
    const onScroll = () => setScrolled(window.scrollY > 64)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [transparentOverHero])

  const go = (page: string) => {
    setMenuOpen(false)
    onNavigate(page)
  }

  // /dashboard re-derives the role from our own DB and redirects to the
  // right portal — signed-out visitors land on the unified sign-in page,
  // which itself redirects to /dashboard once authenticated.
  const portalLabel = isSignedIn ? t("clientPortal") : t("logIn")
  const portalTarget = isSignedIn ? "dashboard" : "client-login"
  const overlay = transparentOverHero && !scrolled

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: overlay ? "transparent" : "rgba(243,242,238,0.92)",
        backdropFilter: overlay ? "none" : "blur(12px)",
        borderBottom: overlay ? "1px solid transparent" : "1px solid #E6E5E0",
        transition: "background 0.2s, border-color 0.2s",
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
          {overlay && (
            <button
              onClick={() => go("home")}
              style={{
                background: "rgba(24,24,26,0.38)",
                backdropFilter: "blur(10px)",
                border: "none",
                cursor: "pointer",
                padding: "9px 16px",
                fontSize: 14,
                fontWeight: 500,
                color: "#fff",
                borderRadius: 10,
                fontFamily: "Poppins, sans-serif",
                marginInlineEnd: 4,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              Home <span style={{ fontSize: 10, opacity: 0.8 }}>▾</span>
            </button>
          )}
          {LINK_IDS.map((id) => (
            <button
              key={id}
              onClick={() => go(id)}
              style={{
                background: overlay ? "rgba(24,24,26,0.38)" : current === id ? "rgba(216,255,62,0.35)" : "none",
                backdropFilter: overlay ? "blur(10px)" : "none",
                border: "none",
                cursor: "pointer",
                padding: overlay ? "9px 16px" : "8px 14px",
                fontSize: 14,
                fontWeight: current === id ? 700 : 500,
                color: overlay
                  ? "#fff"
                  : current === id
                    ? TEXT
                    : MUTED,
                borderRadius: overlay ? 10 : 9999,
                fontFamily: BODY,
                marginInlineEnd: overlay ? 4 : 0,
                transition: "color 0.15s, background 0.15s",
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
              background: LIME,
              color: TEXT,
              border: "none",
              borderRadius: overlay ? 10 : 9999,
              padding: "9px 22px",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: BODY,
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
            stroke={overlay ? "#fff" : TEXT}
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
            borderTop: "1px solid #E6E5E0",
            background: PAPER,
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
                background: current === id ? "rgba(216,255,62,0.35)" : "none",
                border: "none",
                cursor: "pointer",
                padding: "12px 14px",
                fontSize: 15,
                textAlign: "start",
                fontWeight: current === id ? 700 : 500,
                color: current === id ? TEXT : MUTED,
                borderRadius: 10,
                fontFamily: BODY,
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
              background: LIME,
              color: TEXT,
              border: "none",
              borderRadius: 9999,
              padding: "12px 22px",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
              fontFamily: BODY,
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
