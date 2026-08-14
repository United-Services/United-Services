"use client"

// Segment-level error boundary — catches render/data errors anywhere
// under this locale's routes. Deliberately does not depend on next-intl
// (hardcoded English): an error page that itself needs a working i18n
// context to render defeats the purpose of a safety net.

import { useEffect } from "react"
import { palette } from "@/theme"
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        padding: 24,
        fontFamily: "Poppins, sans-serif",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: palette.accentLight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          color: palette.accent,
          fontWeight: 800,
        }}
      >
        !
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: palette.navy }}>
        Something went wrong
      </h1>
      <p
        style={{
          fontSize: 14,
          color: palette.muted,
          maxWidth: 420,
          lineHeight: 1.6,
        }}
      >
        We hit an unexpected error loading this page. Please try again — if this
        keeps happening, contact us at{" "}
        <a href="mailto:info@use-eg.com" style={{ color: palette.accent }}>
          info@use-eg.com
        </a>
        .
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={() => reset()}
          style={{
            background: palette.accent,
            color: "#fff",
            border: "none",
            borderRadius: 9999,
            padding: "11px 26px",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          Try again
        </button>
        <button
          onClick={() => {
            window.location.href = "/"
          }}
          style={{
            background: "#fff",
            color: palette.navy,
            border: `1.5px solid ${palette.border}`,
            borderRadius: 9999,
            padding: "11px 26px",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          Return home
        </button>
      </div>
    </div>
  )
}
