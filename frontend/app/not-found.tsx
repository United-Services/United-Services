import Link from "next/link"

// Root-level 404. app/[locale]/not-found.tsx only renders when notFound()
// is called from INSIDE a matched [locale] route; an unmatched path
// (/en/pricing, /ar/nope) never reaches it and got Next's raw white
// "404 | This page could not be found." — no logo, no link home, no
// language. Measured on both /en/nope and /ar/nope.
//
// Two constraints the locale version doesn't have: there is no
// app/layout.tsx, so this must render its own <html>/<body>; and it
// sits outside ClerkProvider, so it cannot use useClerk()/useAuth() —
// hence no log-out button here. Hardcoded English for the same reason
// the locale version is: a 404 must never depend on the routing/i18n
// context that may be the very thing that failed.
export default function RootNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "Poppins, sans-serif",
          background: "#F3F2EE",
          color: "#0E0E10",
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 13,
              // #4A5A1C, not the lime accent: lime on this ground is
              // ~1.15:1. This keeps the olive/lime family at 7.59:1.
              color: "#4A5A1C",
              fontWeight: 700,
              letterSpacing: "0.15em",
            }}
          >
            404
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
            Page not found
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "#6E6E69",
              maxWidth: 420,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            The page you&apos;re looking for doesn&apos;t exist or may have moved.
          </p>
          <Link
            href="/"
            style={{
              background: "#D8FF3E",
              color: "#0E0E10",
              borderRadius: 9999,
              padding: "11px 26px",
              fontWeight: 700,
              fontSize: 14,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
            }}
          >
            Return home
          </Link>
        </div>
      </body>
    </html>
  )
}
