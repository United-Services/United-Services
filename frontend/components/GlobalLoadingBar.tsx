"use client"

// Slim indeterminate progress bar pinned to the top of the viewport,
// visible whenever one or more axios requests are in flight (see
// lib/loadingBar.ts + lib/api.ts's interceptors). Mounted once in the
// locale layout so every page gets it for free, instead of each view
// having to render its own "is this stuck?" affordance.
import { useEffect, useState } from "react"
import { subscribe } from "../lib/loadingBar"
import { palette } from "../theme"

export default function GlobalLoadingBar() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    return subscribe((pending) => setActive(pending > 0))
  }, [])

  if (!active) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        overflow: "hidden",
        background: "transparent",
      }}
    >
      <div
        style={{
          height: "100%",
          width: "40%",
          background: palette.accent,
          animation: "global-loading-bar-slide 1.1s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes global-loading-bar-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  )
}
