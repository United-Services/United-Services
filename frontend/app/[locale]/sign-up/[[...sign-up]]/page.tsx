"use client"

import { SignUp } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "@/theme"

// No client-side "already signed in" redirect here — Clerk's <SignUp/>
// already refuses to render for a signed-in single-session user and
// redirects to afterSignUp on its own. See the matching comment in the
// sign-in page for why stacking a second redirect trigger on top of
// Clerk's own is what turns a one-time bounce into a ping-pong loop.
export default function SignUpPage() {
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
          {t("signUpTagline")}
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
        <SignUp
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
