"use client"

import { palette } from "@/theme"

// Shown when /me fails for a reason other than "not authenticated" (network
// hiccup, backend 5xx, etc.) while Clerk still holds a valid session.
// Redirecting to /sign-in in that case would just bounce straight back —
// Clerk sees a signed-in user and sends them here again — so this renders
// an inert retry state instead of participating in that loop.
export default function DashboardLoadError({
  message,
  retryLabel,
}: {
  message: string
  retryLabel: string
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        fontFamily: "Poppins, sans-serif",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 13, color: "#DC2626", fontWeight: 600 }}>
        {message}
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: "9px 20px",
          borderRadius: 9999,
          border: "none",
          background: palette.accent,
          color: palette.navy,
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "Poppins, sans-serif",
        }}
      >
        {retryLabel}
      </button>
    </div>
  )
}
