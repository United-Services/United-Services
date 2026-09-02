"use client"

import Link from "next/link"
import { useClerk, useAuth } from "@clerk/nextjs"
import { palette } from "@/theme"

// Hardcoded English, same reasoning as error.tsx — a 404 page must never
// itself depend on data/context that could be the reason the route
// resolution failed in the first place.
export default function LocaleNotFound() {
  const { signOut } = useClerk()
  const { isSignedIn } = useAuth()

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
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
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
        <Link
          href="/tickets?type=technical"
          style={{
            background: "#fff",
            color: palette.navy,
            border: `1.5px solid ${palette.border}`,
            borderRadius: 9999,
            padding: "11px 26px",
            fontWeight: 600,
            fontSize: 14,
            textDecoration: "none",
            fontFamily: "Poppins, sans-serif",
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Submit a ticket
        </Link>
      </div>
      {isSignedIn && (
        <button
          onClick={() => signOut(() => { window.location.href = "/" })}
          style={{
            background: "none",
            border: "1.5px solid #DC2626",
            borderRadius: 9999,
            padding: "9px 20px",
            fontWeight: 600,
            fontSize: 13,
            color: "#DC2626",
            cursor: "pointer",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          Log out
        </button>
      )}
    </div>
  )
}
