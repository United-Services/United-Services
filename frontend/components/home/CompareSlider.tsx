"use client"

import { useRef, useState } from "react"
import { motion } from "framer-motion"
import { palette } from "../../theme"

interface Props {
  beforeSrc: string
  afterSrc: string
  beforeLabel: string
  afterLabel: string
  beforeAlt: string
  afterAlt: string
}

// Drag-to-compare via clip-path rather than react-compare-slider — this is
// a small, self-contained interaction (one clip-path + one drag handler)
// that doesn't earn a new dependency, per the ground rule against adding
// one for an effect the existing stack (Framer Motion, already installed
// for this pass) already expresses cleanly.
export default function CompareSlider({
  beforeSrc,
  afterSrc,
  beforeLabel,
  afterLabel,
  beforeAlt,
  afterAlt,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [percent, setPercent] = useState(50)

  const updateFromClientX = (clientX: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct = ((clientX - rect.left) / rect.width) * 100
    setPercent(Math.min(100, Math.max(0, pct)))
  }

  return (
    <div
      ref={containerRef}
      role="slider"
      aria-label={`${beforeLabel} / ${afterLabel}`}
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setPercent((p) => Math.max(0, p - 5))
        if (e.key === "ArrowRight") setPercent((p) => Math.min(100, p + 5))
      }}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        updateFromClientX(e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.buttons !== 1) return
        updateFromClientX(e.clientX)
      }}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16/10",
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.12)",
        cursor: "ew-resize",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative comparison image, dimensions vary by caller */}
      <img
        src={afterSrc}
        alt={afterAlt}
        draggable={false}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath: `inset(0 ${100 - percent}% 0 0)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- decorative comparison image, dimensions vary by caller */}
        <img
          src={beforeSrc}
          alt={beforeAlt}
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          background: "rgba(15,23,42,0.75)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "6px 12px",
          borderRadius: 9999,
        }}
      >
        {beforeLabel}
      </div>
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          background: "rgba(15,23,42,0.75)",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          padding: "6px 12px",
          borderRadius: 9999,
        }}
      >
        {afterLabel}
      </div>

      <motion.div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${percent}%`,
          width: 3,
          background: "#fff",
          transform: "translateX(-1.5px)",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M5 4L1 8l4 4M11 4l4 4-4 4" stroke={palette.navy} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </motion.div>
    </div>
  )
}
