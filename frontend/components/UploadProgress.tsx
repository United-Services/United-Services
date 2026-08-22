"use client"

import { palette } from "../theme"

interface UploadProgressProps {
  fraction: number | null // null = not uploading
  error: string | null
  onRetry?: () => void
  retryLabel?: string
}

// Shared progress bar + specific-error-and-retry UI for any resumable
// upload (see lib/resumableUpload.ts). Renders nothing when idle.
export default function UploadProgress({ fraction, error, onRetry, retryLabel = "Retry" }: UploadProgressProps) {
  if (fraction === null && !error) return null

  return (
    <div style={{ marginTop: 8, minWidth: 160 }}>
      {fraction !== null && !error && (
        <>
          <div
            style={{
              height: 6,
              borderRadius: 999,
              background: palette.bgAlt,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.round(fraction * 100)}%`,
                background: palette.accent,
                borderRadius: 999,
                transition: "width 0.15s ease",
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: palette.muted, marginTop: 4 }}>
            {Math.round(fraction * 100)}%
          </div>
        </>
      )}
      {error && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#DC2626", fontWeight: 600 }}>{error}</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              style={{
                background: "none",
                border: `1.5px solid ${palette.accentDark}`,
                color: palette.navy,
                borderRadius: 8,
                padding: "3px 10px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
              }}
            >
              {retryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
