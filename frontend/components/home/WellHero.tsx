"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { palette } from "../../theme"
import { LAYER_KEYS, LAYER_STYLE } from "../../lib/pipelineLayers"
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion"

interface Props {
  // false: plays the ignition sequence once, then calls onIgnitionComplete.
  // true: renders the settled/ambient end-state directly — this is what
  // sits behind the hero's text once loading is done, and what a
  // reduced-motion visitor sees from the first frame either way.
  settled: boolean
  onIgnitionComplete?: () => void
}

// The strata bands read outside-in, same order as LAYER_KEYS (wrap is
// outermost/topmost, flow is the innermost core) — a visitor who later
// scrolls the same page's LayerDive section, or visits /services, sees
// the identical five colors in the identical order. Not literal pipe
// geometry here (this is ground strata, not a pipe cross-section) — the
// color language is the connective tissue, not the shape.
const STRATA_Y = [420, 470, 520, 570, 620] // top→bottom band start positions in the 0..800 viewBox

export default function WellHero({ settled, onIgnitionComplete }: Props) {
  const reducedMotion = usePrefersReducedMotion()
  const [phase, setPhase] = useState<"igniting" | "settled">(
    settled || reducedMotion ? "settled" : "igniting",
  )

  useEffect(() => {
    if (settled) return

    if (reducedMotion) {
      // Still a real handoff, just instant — never leaves a reduced-motion
      // visitor staring at a frozen mid-animation frame.
      const t = setTimeout(() => onIgnitionComplete?.(), 400)
      return () => clearTimeout(t)
    }

    // Total sequence: derrick rises (0–900ms) → burst (900–1500ms) →
    // settle (1500–1900ms). Matches the timings passed to the motion
    // elements below.
    const t = setTimeout(() => {
      setPhase("settled")
      onIgnitionComplete?.()
    }, 1900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-runs only on real remount, not on every parent re-render; `settled`/`reducedMotion` are read once per mount by design (the `settled` instance never runs this branch at all)
  }, [])

  const igniting = phase === "igniting"

  return (
    <svg
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMax slice"
      style={{ width: "100%", height: "100%", display: "block" }}
      role="img"
      aria-label="United Services Egypt — pipeline infrastructure"
    >
      <defs>
        <linearGradient id="wh-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B1220" />
          <stop offset="55%" stopColor={palette.navy} />
          <stop offset="100%" stopColor="#1A2438" />
        </linearGradient>
        <radialGradient id="wh-flare" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={palette.accent} stopOpacity="0.9" />
          <stop offset="60%" stopColor={palette.accent} stopOpacity="0.25" />
          <stop offset="100%" stopColor={palette.accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width="1200" height="800" fill="url(#wh-sky)" />

      {/* Strata bands — the layer-dive's color system, present from frame one */}
      {LAYER_KEYS.map((key, i) => (
        <rect
          key={key}
          x="0"
          y={STRATA_Y[i]}
          width="1200"
          height={i === LAYER_KEYS.length - 1 ? 800 - STRATA_Y[i] : STRATA_Y[i + 1] - STRATA_Y[i]}
          fill={LAYER_STYLE[key].color}
          opacity={0.14}
        />
      ))}

      {/* Derrick — a simple geometric tower, not a photoreal render */}
      <motion.g
        initial={igniting ? { y: 60, opacity: 0 } : false}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <path
          d="M600 420 L560 200 L640 200 Z"
          fill="none"
          stroke="#64748B"
          strokeWidth="3"
        />
        <line x1="568" y1="340" x2="632" y2="340" stroke="#64748B" strokeWidth="2" />
        <line x1="576" y1="280" x2="624" y2="280" stroke="#64748B" strokeWidth="2" />
        <line x1="560" y1="200" x2="640" y2="420" stroke="#475569" strokeWidth="1.5" />
        <line x1="640" y1="200" x2="560" y2="420" stroke="#475569" strokeWidth="1.5" />
        <rect x="590" y="170" width="20" height="34" fill="#475569" />
      </motion.g>

      {/* Burst — fires once during ignition, then settles to a slow ambient pulse */}
      <motion.circle
        cx="600"
        cy="180"
        r="120"
        fill="url(#wh-flare)"
        initial={igniting ? { scale: 0, opacity: 0 } : false}
        animate={
          igniting
            ? { scale: [0, 2.4, 1], opacity: [0, 1, 0.5] }
            : { scale: 1, opacity: [0.35, 0.55, 0.35] }
        }
        transition={
          igniting
            ? { duration: 0.6, delay: 0.9, times: [0, 0.55, 1], ease: "easeOut" }
            : { duration: 4, repeat: Infinity, ease: "easeInOut" }
        }
        style={{ transformOrigin: "600px 180px" }}
      />

      {/* Spark streaks — a handful of authored strokes, not a particle system */}
      {igniting &&
        [-40, -18, 0, 22, 42].map((dx, i) => (
          <motion.line
            key={dx}
            x1={600 + dx}
            y1="180"
            x2={600 + dx * 1.6}
            y2="80"
            stroke={palette.accent}
            strokeWidth="3"
            strokeLinecap="round"
            initial={{ opacity: 0, pathLength: 0 }}
            animate={{ opacity: [0, 1, 0], pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.95 + i * 0.04, ease: "easeOut" }}
          />
        ))}
    </svg>
  )
}
