import type React from "react"

// Lime accent, matching the public site's theme (lib/publicTheme.tsx) —
// this file is now imported exclusively by private/authenticated surfaces
// (dashboards, auth flows) after the public pages moved to publicTheme.tsx,
// so updating the values here retints every private page in one place.
//
// `accent` doubles as plain text color (labels, links, numbers) in dozens
// of call sites, not just button backgrounds — the public theme's bright
// lime (#D8FF3E) fails contrast as text-on-white, so this is a darker,
// legible olive-lime at the same hue instead. `accentSolid` carries the
// actual bright lime for places that only ever use it as a filled
// background (buttons, badges) and set their own text color on top.
export const palette = {
  accent: "#586B0A",
  accentDark: "#3F4F06",
  accentLight: "#F4FBD9",
  accentSolid: "#D8FF3E",
  navy: "#0E0E10",
  slate: "#3C3C38",
  muted: "#8C8C88",
  border: "#E6E5E0",
  bg: "#FFFFFF",
  bgAlt: "#F3F2EE",
}

export const btnPrimary: React.CSSProperties = {
  background: "#586B0A",
  color: "#fff",
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
