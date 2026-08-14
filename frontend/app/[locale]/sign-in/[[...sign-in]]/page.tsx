"use client"

import { SignIn } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "@/theme"

// No client-side "already signed in" redirect here — Clerk's <SignIn/>
// already refuses to render for a signed-in single-session user and
// redirects to afterSignIn on its own (see its dev-only console notice).
// A second, independent redirect trigger on top of Clerk's own is exactly
// what turns a legitimate one-time bounce into a fast ping-pong loop with
// /dashboard whenever the backend briefly disagrees with Clerk about the
// session being valid.
export default function SignInPage() {
  const t = useTranslations("auth")

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: "Poppins, sans-serif",
      }}
    >
      <div
        className="auth-photo-panel"
        style={{
          flex: 1,
          position: "relative",
          backgroundImage:
            "linear-gradient(180deg, rgba(15,23,42,0.35), rgba(15,23,42,0.85)), url('/images/hero-petroleum-v001.webp')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 56,
        }}
      >
        <img
          src="/images/logo-footer.png"
          alt={t("brand")}
          style={{ height: 32, width: "auto", marginBottom: 24 }}
        />
        <p
          style={{
            color: "#fff",
            fontSize: 20,
            fontWeight: 600,
            lineHeight: 1.5,
            maxWidth: 420,
          }}
        >
          {t("signInTagline")}
        </p>
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 380,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: palette.bgAlt,
          padding: 24,
        }}
      >
        <SignIn
          appearance={{
            variables: {
              colorPrimary: palette.accent,
              fontFamily: "Poppins, sans-serif",
            },
            elements: {
              card: { boxShadow: "0 8px 32px rgba(15,23,42,0.08)" },
            },
          }}
        />
      </div>

      <style>{`
        @media (max-width: 860px) {
          .auth-photo-panel { display: none; }
        }
      `}</style>
    </div>
  )
}
