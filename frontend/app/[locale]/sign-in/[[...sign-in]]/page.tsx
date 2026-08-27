"use client"

import { SignIn } from "@clerk/nextjs"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { palette } from "@/theme"
import PublicNav from "@/components/PublicNav"
import { useAppNavigate } from "@/lib/navigate"

const worldImg = "/images/login.jpg"

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
          <Image
            src={worldImg}
            alt="Industrial energy infrastructure"
            fill
            priority
            style={{ objectFit: "cover" }}
          />
          {/* Plain dark scrim (no accent tint) — keeps the tagline/quote
              readable over the photo without color-washing the image. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(15,23,42,0.05) 0%, rgba(15,23,42,0.85) 100%)",
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
          className="auth-form-panel"
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
                // Only the "Don't have an account? Sign up" footer link —
                // a plain text link, not a filled button, so
                // colorPrimary's lime read as low-contrast text-on-white
                // here specifically. Scoped to just this element rather
                // than changing colorPrimary globally, which would also
                // repaint the Sign In button and every other
                // colorPrimary-driven element in the form.
                footerActionLink: { color: palette.navy },
              },
            }}
          />
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          /* !important: the panel also carries an inline style prop with
             its own display: "flex", which otherwise beats a plain class
             rule regardless of the media query matching — this is why the
             panel and the sign-in card were rendering on top of each
             other on a phone instead of the panel actually hiding. */
          .auth-photo-panel { display: none !important; }
          /* The 380px minWidth (meant to keep the form from getting
             squeezed too narrow in the two-column layout) is itself wider
             than a phone viewport once the photo panel above is gone —
             drop it so the panel can shrink to fit instead of overflowing
             the page horizontally. */
          .auth-form-panel { min-width: 0 !important; padding: 24px 16px !important; }
        }
      `}</style>
    </div>
  )
}
