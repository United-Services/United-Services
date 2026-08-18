"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Canvas, type CanvasProps } from "@react-three/fiber"
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion"

interface Props {
  children: ReactNode
  style?: React.CSSProperties
  canvasProps?: Partial<CanvasProps>
}

// Every Three.js scene on the public site goes through this wrapper —
// it's the one place that enforces the two rules that keep WebGL from
// becoming a performance liability across seven pages:
//   1. prefers-reduced-motion skips the scene entirely (no canvas, no
//      render loop) rather than shipping motion and hoping CSS catches it.
//   2. The canvas only mounts once scrolled near the viewport, and
//      unmounts again once scrolled well away — an off-screen WebGL
//      context still costs a render loop if left mounted, so this uses
//      IntersectionObserver + unmount instead of visibility:hidden.
export default function InViewCanvas({ children, style, canvasProps }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (reducedMotion) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "200px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [reducedMotion])

  return (
    <div ref={ref} style={{ position: "absolute", inset: 0, ...style }}>
      {inView && !reducedMotion && (
        <Canvas
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: true }}
          {...canvasProps}
        >
          {children}
        </Canvas>
      )}
    </div>
  )
}
