import type React from "react"

// Lime accent, matching the public site's theme (lib/publicTheme.tsx)
// exactly (#D8FF3E) — this file is now imported exclusively by private/
// authenticated surfaces (dashboards, auth flows) after the public pages
// moved to publicTheme.tsx, so updating the values here retints every
// private page in one place.
//
// Known tradeoff: `accent` is also used as plain text color (labels,
// small links) at ~10 call sites across AdminDashboard.tsx,
// ClientSignup.tsx, and CandidateDashboard.tsx — bright lime text on a
// white background reads as very low-contrast/hard to read at those
// sizes. Left as-is per explicit instruction to match the exact color;
// flag if those specific spots should get a readable treatment (e.g. a
// dark chip/pill background behind the lime text, same pattern already
// used for badges) rather than lime text directly on white.
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
  fontFamily: "Poppins, sans-serif",
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
  fontFamily: "Poppins, sans-serif",
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
  fontFamily: "Poppins, sans-serif",
}
