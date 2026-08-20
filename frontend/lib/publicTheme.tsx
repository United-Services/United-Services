import type React from "react"

// Shared palette + typography for the public marketing pages (Home, About,
// Vision, Services, Projects, Careers, Contact, legal pages, PublicFooter)
// — imported from the Claude Design (.dc.html) project ("United Services
// Egypt.dc.html") that redesigned the homepage first. Deliberately NOT
// merged into ../theme.tsx: that file's palette.navy/accent + Poppins are
// still load-bearing for every authenticated dashboard/admin/auth screen,
// which this redesign never touched — scoping the new tokens here keeps
// that blast radius at zero.
export const INK = "#0E0E10"
export const PAPER = "#F3F2EE"
export const TEXT = "#121212"
export const MUTED = "#8C8C88"
export const LIME = "#D8FF3E"
export const HEAD = "'Space Grotesk', sans-serif"
export const BODY = "'Inter', sans-serif"

export const publicBtnPrimary: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  background: TEXT,
  color: "#fff",
  border: "none",
  borderRadius: 9999,
  padding: "14px 30px",
  fontWeight: 500,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: HEAD,
  transition: "background 0.2s",
}

export const publicBtnLime: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  background: LIME,
  color: TEXT,
  border: "none",
  borderRadius: 9999,
  padding: "14px 30px",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: BODY,
  transition: "background 0.2s",
}

export const publicBtnOutline: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  background: "transparent",
  color: TEXT,
  border: "1.5px solid #E6E5E0",
  borderRadius: 9999,
  padding: "14px 30px",
  fontWeight: 500,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: BODY,
  transition: "background 0.2s, border-color 0.2s, color 0.2s",
}

export const PublicTag = ({ children }: { children: React.ReactNode }) => (
  <span
    style={{
      display: "inline-block",
      background: LIME,
      color: TEXT,
      fontSize: 12,
      fontWeight: 600,
      padding: "7px 14px",
      borderRadius: 8,
      fontFamily: BODY,
    }}
  >
    {children}
  </span>
)
