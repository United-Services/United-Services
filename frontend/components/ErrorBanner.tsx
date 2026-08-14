"use client"

interface Props {
  message: string | null
  onDismiss: () => void
  dismissLabel: string
}

// One consistent way for every dashboard to surface a failed request
// (4xx/5xx/network) instead of leaving the page silently stuck on a
// stale/loading state — matches the existing { type, text } banner style
// already used in CandidateDashboard/AdminSecuritySection.
export default function ErrorBanner({ message, onDismiss, dismissLabel }: Props) {
  if (!message) return null
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 16px",
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
      <button
        onClick={onDismiss}
        aria-label={dismissLabel}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#DC2626",
          fontWeight: 700,
          fontSize: 15,
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}
