"use client"

import { SignIn } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "@/theme"
import PublicNav from "@/components/PublicNav"
import { useAppNavigate } from "@/lib/navigate"

// Same photo used for the client-signup split panel (views/ClientSignup.tsx).
const worldImg =
  "https://images.unsplash.com/photo-1602860109208-613d39362844?w=1200&q=85"

// No client-side "already signed in" redirect here — Clerk's <SignIn/>
// already refuses to render for a signed-in single-session user and
// redirects to afterSignIn on its own (see its dev-only console notice).
// A second, independent redirect trigger on top of Clerk's own is exactly
// what turns a legitimate one-time bounce into a fast ping-pong loop with
// /dashboard whenever the backend briefly disagrees with Clerk about the
// session being valid.
export default function SignInPage() {
  const t = useTranslations("auth")
  const navigate = useAppNavigate()

  return (
    <div style={{ fontFamily: "Poppins, sans-serif" }}>
      <PublicNav current="sign-in" onNavigate={navigate} />

      <div
        style={{
          display: "flex",
          marginTop: 68,
          minHeight: "calc(100vh - 68px)",
        }}
      >
        <div
          className="auth-photo-panel"
          style={{
            flex: 1,
            position: "relative",
            overflow: "hidden",
            background: "#111",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: 56,
          }}
        >
          <img
            src={worldImg}
            alt="Industrial energy infrastructure"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.75,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(135deg, ${palette.accent}bb 0%, rgba(15,23,42,0.85) 100%)`,
            }}
          />
          <p
            style={{
              position: "relative",
              color: "#fff",
              fontSize: 20,
              fontWeight: 600,
              lineHeight: 1.5,
              maxWidth: 420,
            }}
          >
            {t("signInTagline")}
          </p>

          <div
            style={{
              position: "relative",
              marginTop: 32,
              paddingTop: 24,
              borderTop: "1px solid rgba(255,255,255,0.25)",
              maxWidth: 420,
            }}
          >
            <p
              style={{
                color: "rgba(255,255,255,0.9)",
                fontSize: 15,
                fontStyle: "italic",
                lineHeight: 1.7,
                marginBottom: 12,
              }}
            >
              “{t("ceoQuote")}”
            </p>
            <p
              style={{
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {t("ceoName")}
              <span
                style={{
                  color: "rgba(255,255,255,0.7)",
                  fontWeight: 500,
                }}
              >
                {" — "}
                {t("ceoTitle")}
              </span>
            </p>
          </div>
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
                colorDanger: "#DC2626",
                fontFamily: "Poppins, sans-serif",
              },
              elements: {
                card: { boxShadow: "0 8px 32px rgba(15,23,42,0.08)" },
                // Clerk defaults every colorPrimary-filled button to white
                // text — invisible against this pale a lime. Same fix as
                // every other lime-filled button on the site (dark text,
                // not white).
                formButtonPrimary: { color: palette.navy },
                // Explicit, high-contrast override for wrong-password/
                // wrong-identifier feedback — a mismatched credential must
                // never fail "silently" from the user's point of view.
                formFieldErrorText: { color: "#DC2626", fontWeight: 600 },
                alertText: { color: "#DC2626", fontWeight: 600 },
                identityPreviewText: { color: palette.navy },
              },
            }}
          />
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .auth-photo-panel { display: none; }
        }
      `}</style>
    </div>
  )
}
