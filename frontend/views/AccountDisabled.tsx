"use client"

import { TEXT, MUTED, HEAD, BODY, publicBtnLime, publicBtnOutline } from "../lib/publicTheme"

interface Props {
  onNavigate: (page: string, param?: string) => void
  onLogout: () => void
}

// Reached only via dashboard/page.tsx's redirect when ClerkAuthGuard's
// 401 specifically means "account exists but disabledAt is set" — never
// for an actually-invalid session (that goes to /sign-in instead). Kept
// as a plain client component with hardcoded copy, same reasoning as
// error.tsx/not-found.tsx: it must never depend on the very backend call
// that got the user here in the first place.
export default function AccountDisabled({ onNavigate, onLogout }: Props) {
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
        fontFamily: BODY,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 4 }}>🔒</div>
      <h1 style={{ fontFamily: HEAD, fontSize: 26, fontWeight: 700, color: TEXT, margin: 0 }}>
        This account has been disabled
      </h1>
      <p style={{ fontSize: 14.5, color: MUTED, maxWidth: 440, lineHeight: 1.7, margin: 0 }}>
        If you believe this is a mistake, let us know and we&apos;ll look into it.
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <button
          onClick={() => onNavigate("tickets", "disabled_account")}
          style={publicBtnLime}
        >
          Report this as a mistake
        </button>
        <button onClick={() => onNavigate("home")} style={publicBtnOutline}>
          Return home
        </button>
      </div>
      <button
        onClick={onLogout}
        style={{
          background: "none",
          border: "1.5px solid #DC2626",
          borderRadius: 9999,
          cursor: "pointer",
          padding: "8px 20px",
          fontSize: 13,
          fontWeight: 600,
          color: "#DC2626",
          fontFamily: BODY,
          marginTop: 4,
        }}
      >
        Log out
      </button>
    </div>
  )
}
