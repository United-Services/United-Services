import type React from "react"

// Lime accent, matching the public site's theme (lib/publicTheme.tsx)
// exactly (#D8FF3E) — this file is now imported exclusively by private/
// authenticated surfaces (dashboards, auth flows) after the public pages
// moved to publicTheme.tsx, so updating the values here retints every
// private page in one place.
//
// `accent` is never used as plain text color on a light background —
// lime at ~1.3:1 fails WCAG AA (4.5:1) there. Every former lime-text
// call site (AdminDashboard.tsx, ClientSignup.tsx, CandidateDashboard.tsx)
// was moved to `navy` for text; `accent` stays reserved for backgrounds
// (buttons/badges/progress fills) where navy or another dark tone sits
// on top of it.
export const palette = {
  accent: "#D8FF3E",
  accentDark: "#C2E82E",
  accentLight: "#F4FBD9",
  navy: "#0E0E10",
  slate: "#3C3C38",
  muted: "#8C8C88",
  border: "#E6E5E0",
  bg: "#FFFFFF",
  bgAlt: "#F3F2EE",
}

export const btnPrimary: React.CSSProperties = {
  background: "#D8FF3E",
  // Dark text, not white — same pattern as every lime-filled button on the
  // public site (lib/publicTheme.tsx's publicBtnLime): white-on-#D8FF3E is
  // nearly unreadable, this pale a lime needs dark text on top of it.
  color: "#0E0E10",
  border: "none",
  borderRadius: 9999,
  padding: "13px 32px",
  fontWeight: 700,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "var(--font-poppins), sans-serif",
  transition: "background 0.2s, box-shadow 0.2s",
  display: "inline-block",
}

export const btnGrey: React.CSSProperties = {
  background: "#4B5563",
  color: "#fff",
  border: "none",
  borderRadius: 9999,
  padding: "13px 32px",
  fontWeight: 600,
  fontSize: 15,
  cursor: "pointer",
  fontFamily: "var(--font-poppins), sans-serif",
  transition: "background 0.2s, box-shadow 0.2s",
  display: "inline-block",
}

export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 16px",
  borderRadius: 14,
  border: "1.5px solid #E6E5E0",
  fontSize: 15,
  color: "#0E0E10",
  background: "#fff",
  outline: "none",
  transition: "border-color 0.2s",
  boxSizing: "border-box" as const,
  fontFamily: "var(--font-poppins), sans-serif",
}
