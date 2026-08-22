"use client"

import type { CSSProperties } from "react"

interface SkeletonProps {
  width?: string | number
  height?: string | number
  radius?: number
  style?: CSSProperties
}

// Base shimmer block — compose these into page/section-specific skeletons.
// Uses theme.tsx tokens (bgAlt base, border highlight) so it matches every
// private surface without needing its own color story.
export function Skeleton({ width = "100%", height = 16, radius = 6, style }: SkeletonProps) {
  return (
    <div
      className="us-skeleton"
      style={{
        width,
        height,
        borderRadius: radius,
        ...style,
      }}
    />
  )
}

export function SkeletonText({ lines = 1, width = "100%", lastLineWidth = "70%" }: { lines?: number; width?: string | number; lastLineWidth?: string | number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={13} width={i === lines - 1 && lines > 1 ? lastLineWidth : width} />
      ))}
    </div>
  )
}

export function SkeletonCircle({ size = 40 }: { size?: number }) {
  return <Skeleton width={size} height={size} radius={size} />
}

// A single list/table row: avatar + two lines of text.
export function SkeletonRow({ withAvatar = true }: { withAvatar?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0" }}>
      {withAvatar && <SkeletonCircle size={36} />}
      <div style={{ flex: 1 }}>
        <SkeletonText lines={2} lastLineWidth="40%" />
      </div>
    </div>
  )
}

export function SkeletonRows({ count = 5, withAvatar = true }: { count?: number; withAvatar?: boolean }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} withAvatar={withAvatar} />
      ))}
    </div>
  )
}

// A card-shaped placeholder — service cards, job listings, etc.
export function SkeletonCard({ height = 140 }: { height?: number }) {
  return (
    <div
      style={{
        border: "1px solid #E6E5E0",
        borderRadius: 14,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <Skeleton height={18} width="55%" />
      <SkeletonText lines={2} lastLineWidth="80%" />
      <Skeleton height={32} width={110} radius={8} style={{ marginTop: 4 }} />
      {height > 140 && <Skeleton height={height - 140} />}
    </div>
  )
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

// Full-page skeleton — used by route-level loading.tsx in place of a
// full-screen spinner overlay.
export function SkeletonPage() {
  return (
    <div style={{ minHeight: "100vh", padding: 32, maxWidth: 1100, margin: "0 auto" }}>
      <Skeleton height={28} width="30%" style={{ marginBottom: 24 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 32 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={90} radius={12} />
        ))}
      </div>
      <SkeletonRows count={6} />
    </div>
  )
}

// A bordered panel placeholder — MFA setup/challenge, settings sections.
export function SkeletonPanel({ lines = 4 }: { lines?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "32px 16px" }}>
      <SkeletonCircle size={56} />
      <Skeleton height={16} width="50%" />
      <div style={{ width: "100%", maxWidth: 320 }}>
        <SkeletonText lines={lines} lastLineWidth="60%" />
      </div>
    </div>
  )
}
