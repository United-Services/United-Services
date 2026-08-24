"use client"

// Admin dashboard shell: sidebar nav + section switch. Each sidebar
// section's content lives in its own file (AdminOverviewSection,
// AdminClientsSection, etc.) following the pattern established by
// AdminSecuritySection.tsx — this file only owns navigation, the shared
// error banner, and wiring the right section component to `section`.

import { useState } from "react"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import {
  IconHome,
  IconChart,
  IconUsers,
  IconFolder,
  IconClipboard,
  IconCompass,
  IconCap,
  IconBriefcase,
  IconCalendar,
  IconReceipt,
  IconLock,
  IconLogout,
  IconTicket,
} from "../components/NavIcons"
import ErrorBanner from "../components/ErrorBanner"
import PublicNav from "../components/PublicNav"
import AdminSecuritySection from "./AdminSecuritySection"
import AdminOverviewSection from "./AdminOverviewSection"
import AdminAnalyticsSection from "./AdminAnalyticsSection"
import AdminClientsSection from "./AdminClientsSection"
import AdminSpecsSection from "./AdminSpecsSection"
import AdminRequestsSection from "./AdminRequestsSection"
import AdminPositionsSection from "./AdminPositionsSection"
import AdminCandidatesSection from "./AdminCandidatesSection"
import AdminRfqsSection from "./AdminRfqsSection"
import AdminBookingsSection from "./AdminBookingsSection"
import AdminAuditSection from "./AdminAuditSection"
import AdminTicketsSection from "./AdminTicketsSection"

interface Props {
  onLogout: () => void
  onNavigate: (page: string) => void
}

export default function AdminDashboard({ onLogout, onNavigate }: Props) {
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const [section, setSection] = useState("overview")
  // Every section's load/action functions set this on failure instead of
  // letting a rejected axios promise propagate unhandled — previously a
  // 4xx/5xx/network error left whatever section triggered it silently
  // stuck (loading state never resolved, nothing told the admin anything
  // failed). One shared banner, cleared at the start of each new attempt.
  const [error, setError] = useState<string | null>(null)

  const NAV = [
    { id: "overview", label: t("nav.overview"), icon: <IconHome /> },
    { id: "analytics", label: t("nav.analytics"), icon: <IconChart /> },
    { id: "clients", label: t("nav.clients"), icon: <IconUsers /> },
    { id: "specs", label: t("nav.specs"), icon: <IconFolder /> },
    { id: "requests", label: t("nav.requests"), icon: <IconClipboard /> },
    { id: "positions", label: t("nav.positions"), icon: <IconCompass /> },
    { id: "candidates", label: t("nav.candidates"), icon: <IconCap /> },
    { id: "rfqs", label: t("nav.rfqs"), icon: <IconBriefcase /> },
    { id: "bookings", label: t("nav.bookings"), icon: <IconCalendar /> },
    { id: "audit", label: t("nav.audit"), icon: <IconReceipt /> },
    { id: "tickets", label: t("nav.tickets"), icon: <IconTicket /> },
    { id: "security", label: t("nav.security"), icon: <IconLock /> },
  ]

  return (
    <div style={{ fontFamily: "Poppins, sans-serif" }}>
      <PublicNav current="admin-dashboard" onNavigate={onNavigate} />
      <div
        style={{
          display: "flex",
          marginTop: 68,
          height: "calc(100vh - 68px)",
          overflow: "hidden",
          background: "#F3F2EE",
        }}
      >
      {}
      <aside
        className="dashboard-sidebar"
        style={{
          width: 220,
          flexShrink: 0,
          background: palette.navy,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            borderBottom: "1px solid #1E293B",
          }}
        >
          <button
            onClick={() => onNavigate("home")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <img
              src="/images/logo-footer.webp"
              alt="United Services Egypt"
              style={{ height: 26, width: "auto", objectFit: "contain" }}
            />
            <div className="sidebar-label">
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
                {t("panelLabel")}
              </div>
              <div style={{ fontSize: 9, color: "#475569" }}>
                United Services Egypt
              </div>
            </div>
          </button>
        </div>
        <nav
          style={{
            flex: 1,
            padding: "12px 8px",
            display: "flex",
            flexDirection: "column",
            gap: 2,
            overflowY: "auto",
          }}
        >
          {NAV.map((n) => (
            <button
              key={n.id}
              className="sidebar-nav-btn"
              onClick={() => setSection(n.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "9px 12px",
                borderRadius: 9,
                border: "none",
                background:
                  section === n.id ? "rgba(234,88,12,0.15)" : "transparent",
                color: section === n.id ? palette.accent : "#8C8C88",
                fontWeight: section === n.id ? 600 : 400,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
                textAlign: "left",
                transition: "background 0.15s",
              }}
            >
              {n.icon}
              <span className="sidebar-label">{n.label}</span>
            </button>
          ))}
        </nav>
        <div style={{ padding: "10px 8px", borderTop: "1px solid #1E293B" }}>
          <button
            className="sidebar-nav-btn"
            onClick={onLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 12px",
              borderRadius: 9,
              border: "none",
              background: "transparent",
              color: "#EF4444",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              width: "100%",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            <IconLogout size={14} />
            <span className="sidebar-label">{t("logOut")}</span>
          </button>
        </div>
      </aside>

      {}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            height: 64,
            background: "#fff",
            borderBottom: "1px solid #E6E5E0",
            display: "flex",
            alignItems: "center",
            padding: "0 32px",
          }}
        >
          <h1 style={{ fontSize: 17, fontWeight: 700, color: palette.navy }}>
            {NAV.find((n) => n.id === section)?.label ?? t("headerFallback")}
          </h1>
        </header>

        <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
          <ErrorBanner
            message={error}
            onDismiss={() => setError(null)}
            dismissLabel={tCommon("errors.dismiss")}
          />
          {section === "overview" && (
            <AdminOverviewSection
              setError={setError}
              onViewAuditLog={() => setSection("audit")}
            />
          )}
          {section === "analytics" && (
            <AdminAnalyticsSection setError={setError} />
          )}
          {section === "clients" && (
            <AdminClientsSection setError={setError} />
          )}
          {section === "specs" && <AdminSpecsSection setError={setError} />}
          {section === "requests" && (
            <AdminRequestsSection setError={setError} />
          )}
          {section === "positions" && (
            <AdminPositionsSection setError={setError} />
          )}
          {section === "candidates" && (
            <AdminCandidatesSection setError={setError} />
          )}
          {section === "rfqs" && <AdminRfqsSection setError={setError} />}
          {section === "bookings" && (
            <AdminBookingsSection setError={setError} />
          )}
          {section === "audit" && <AdminAuditSection setError={setError} />}
          {section === "tickets" && <AdminTicketsSection setError={setError} />}
          {section === "security" && <AdminSecuritySection />}
        </main>
      </div>
      </div>
    </div>
  )
}
