"use client"

interface Props {
  message: string | null
  onDismiss: () => void
  dismissLabel: string
  // Optional: when provided, the banner offers a real recovery action —
  // re-running the request that failed — instead of only a dismiss.
  // Dismissing an error isn't resolving it; without this the user was
  // left on a broken view with no path forward.
  onRetry?: () => void
  retryLabel?: string
}

// One consistent way for every dashboard to surface a failed request
// (4xx/5xx/network) instead of leaving the page silently stuck on a
// stale/loading state — matches the existing { type, text } banner style
// already used in CandidateDashboard/AdminSecuritySection.
export default function ErrorBanner({
  message,
  onDismiss,
  dismissLabel,
  onRetry,
  retryLabel,
}: Props) {
  if (!message) return null
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 8px 8px 16px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 600,
        marginBottom: 20,
        background: "#FEF2F2",
        color: "#DC2626",
        border: "1px solid #FECACA",
      }}
    >
      <span>{message}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        {onRetry && (
          <button
            onClick={onRetry}
            style={{
              background: "#DC2626",
              color: "#fff",
              border: "none",
              borderRadius: 9999,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 13,
              padding: "8px 14px",
              minHeight: 36,
              fontFamily: "inherit",
            }}
          >
            {retryLabel ?? "Try again"}
          </button>
        )}
        {/* 44×44 hit area — was `padding: 0` at 15px, roughly 10×15px. */}
        <button
          onClick={onDismiss}
          aria-label={dismissLabel}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#DC2626",
            fontWeight: 700,
            fontSize: 18,
            lineHeight: 1,
            padding: 8,
            minWidth: 44,
            minHeight: 44,
            borderRadius: 9999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
