"use client"

// Small pieces shared across the admin dashboard's per-section files
// (AdminOverviewSection, AdminClientsSection, etc.) and the AdminDashboard
// shell itself. Pulled out to a shared module instead of being duplicated
// in every section file, since most sections use several of these.

import { useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { InlineSpinner } from "../components/Spinner"
import { Skeleton } from "../components/Skeleton"

export const fmtDate = (d: string) => new Date(d).toLocaleDateString()
export const fmtDateTime = (d: string) => new Date(d).toLocaleString()
export const fmtTime = (d: string) =>
  new Date(d).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })

export const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: palette.navy,
  marginBottom: 6,
}
export const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 10,
  border: "1.5px solid #E6E5E0",
  fontSize: 13,
  fontFamily: "Poppins, sans-serif",
}

// Hoisted to module scope — a component defined during render gets a new
// identity every render, which forces React to remount it instead of
// reconciling. Calls its own useTranslations() rather than taking `t` as a
// prop — a hook works the same from any component, not just the one that
// originally called it.
export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("adminDashboard")
  const map: Record<string, { bg: string; color: string }> = {
    pending: { bg: "#FEF3C7", color: "#92400E" },
    approved: { bg: "#DCFCE7", color: "#166534" },
    open: { bg: "#DCFCE7", color: "#166534" },
    denied: { bg: "#FEE2E2", color: "#991B1B" },
    in_review: { bg: "#DBEAFE", color: "#1E40AF" },
    quoted: { bg: "#F3F4F6", color: "#374151" },
    closed: { bg: "#F3F2EE", color: "#475569" },
    booked: { bg: "#DBEAFE", color: "#1E40AF" },
    done: { bg: "#DCFCE7", color: "#166534" },
    cancelled: { bg: "#FEE2E2", color: "#991B1B" },
    contacted: { bg: "#DCFCE7", color: "#166534" },
    active: { bg: "#DCFCE7", color: "#166534" },
    disabled: { bg: "#FEE2E2", color: "#991B1B" },
  }
  const s = map[status] ?? { bg: "#F3F2EE", color: "#475569" }
  const label = t.has(`status.${status}`) ? t(`status.${status}` as any) : status
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: 9999,
        background: s.bg,
        color: s.color,
        textTransform: "capitalize",
      }}
    >
      {label}
    </span>
  )
}

export function ActionPair({
  status,
  onApprove,
  onDeny,
}: {
  status: string
  onApprove: () => void
  onDeny: () => void
}) {
  const t = useTranslations("adminDashboard")
  if (status !== "pending") return <StatusBadge status={status} />
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button
        onClick={onApprove}
        style={{
          background: "#166534",
          color: "#fff",
          border: "none",
          borderRadius: 9999,
          padding: "5px 14px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "Poppins, sans-serif",
        }}
      >
        {t("approve")}
      </button>
      <button
        onClick={onDeny}
        style={{
          background: "#991B1B",
          color: "#fff",
          border: "none",
          borderRadius: 9999,
          padding: "5px 14px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: "Poppins, sans-serif",
        }}
      >
        {t("deny")}
      </button>
    </div>
  )
}

export const tableHead = (cols: string[]) => (
  <thead>
    <tr>
      {cols.map((c) => (
        <th
          key={c}
          style={{
            padding: "10px 16px",
            fontSize: 11,
            fontWeight: 700,
            color: palette.muted,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            textAlign: "left",
            borderBottom: "1px solid #E6E5E0",
            background: "#F3F2EE",
          }}
        >
          {c}
        </th>
      ))}
    </tr>
  </thead>
)

// A skeleton table body — same column count as `tableHead`, used while a
// `usePaginatedList` section's `initialLoading` is still true.
export function TableSkeletonRows({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} style={{ padding: "14px 16px" }}>
              <Skeleton height={12} width={c === 0 ? "70%" : "50%"} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

export function LoadMoreButton({
  hasMore,
  loading,
  onClick,
}: {
  hasMore: boolean
  loading: boolean
  onClick: () => void
}) {
  const tCommon = useTranslations("common")
  if (!hasMore) return null
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
      <button
        onClick={onClick}
        disabled={loading}
        style={{
          background: "#F3F2EE",
          color: palette.navy,
          border: "1.5px solid #E6E5E0",
          borderRadius: 9999,
          padding: "9px 22px",
          fontWeight: 600,
          fontSize: 13,
          cursor: loading ? "default" : "pointer",
          fontFamily: "Poppins, sans-serif",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {loading && <InlineSpinner size={13} />}
        {loading ? tCommon("loadingMore") : tCommon("loadMore")}
      </button>
    </div>
  )
}

// Hoisted to module scope — a component defined during render gets a new
// identity every render, which forces React to remount it instead of
// reconciling, so this input would lose focus on every keystroke-triggered
// re-render. Fuzzy-matched live search — see
// backend/src/common/utils/fuzzy-match.ts. No submit button: typing
// debounces straight into onSearch, so there's nothing to click and no
// stale "did I search yet?" state to track.
export function SearchBox({
  value,
  onChange,
  onSearch,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  onSearch: () => void
  placeholder: string
}) {
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const timer = setTimeout(() => onSearch(), 300)
    return () => clearTimeout(timer)
    // Deliberately keyed only on `value` — onSearch is a fresh closure
    // every parent render (it always captures the current query text
    // itself), so including it here would re-fire the debounce on every
    // unrelated re-render instead of just when the user actually types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div
      style={{
        marginBottom: 16,
        display: "flex",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          maxWidth: 320,
          padding: "9px 14px",
          borderRadius: 9999,
          border: "1.5px solid #E6E5E0",
          fontSize: 13,
          fontFamily: "Poppins, sans-serif",
          outline: "none",
        }}
      />
    </div>
  )
}
