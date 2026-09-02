"use client"

// Root-level error boundary — catches errors thrown by the root layout
// itself (before locale/i18n context is even established), so it must
// render its own complete <html><body> and can't depend on next-intl or
// any provider. Deliberately plain English and self-contained.

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 16,
            padding: 24,
            fontFamily: "system-ui, sans-serif",
            background: "#0F172A",
            color: "#fff",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: "#94A3B8", maxWidth: 420 }}>
            United Services Egypt hit an unexpected error. Please try again — if
            this keeps happening, submit a ticket and we&apos;ll look into it.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={() => reset()}
              style={{
                background: "#EA580C",
                color: "#fff",
                border: "none",
                borderRadius: 9999,
                padding: "12px 28px",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* Plain <a>, not next/link: this boundary catches errors from the
                root layout itself, so it can't assume next-intl's router
                context (or any provider) is actually mounted. */}
            <a
              href="/tickets?type=technical"
              style={{
                background: "transparent",
                color: "#fff",
                border: "1.5px solid #475569",
                borderRadius: 9999,
                padding: "12px 28px",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Submit a ticket
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
