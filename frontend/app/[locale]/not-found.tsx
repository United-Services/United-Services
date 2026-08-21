import Link from "next/link"
import { palette } from "@/theme"

// Hardcoded English, same reasoning as error.tsx — a 404 page must never
// itself depend on data/context that could be the reason the route
// resolution failed in the first place.
export default function LocaleNotFound() {
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
          fontSize: 13,
          color: palette.accent,
          fontWeight: 700,
          letterSpacing: "0.15em",
        }}
      >
        404
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: palette.navy }}>
        Page not found
      </h1>
      <p
        style={{
          fontSize: 14,
          color: palette.muted,
          maxWidth: 420,
          lineHeight: 1.6,
        }}
      >
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Link
        href="/"
        style={{
          background: palette.accent,
          color: palette.navy,
          border: "none",
          borderRadius: 9999,
          padding: "11px 26px",
          fontWeight: 700,
          fontSize: 14,
          textDecoration: "none",
          fontFamily: "Poppins, sans-serif",
        }}
      >
        Return home
      </Link>
    </div>
  )
}
