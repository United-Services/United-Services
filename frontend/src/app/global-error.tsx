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
            this keeps happening, contact us at info@use-eg.com.
          </p>
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
        </div>
      </body>
    </html>
  )
}
