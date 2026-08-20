"use client"

import { useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import InViewCanvas from "./InViewCanvas"

interface SceneProps {
  color: string
  count: number
}

// Slow-drifting point field, loosely reading as flow through a pipeline —
// upward drift + gentle horizontal sway, not a generic starfield. Kept to
// points-only (no geometry, no textures) so the per-frame cost stays flat
// regardless of how many pages mount it.
function Scene({ color, count }: SceneProps) {
  const points = useRef<THREE.Points>(null)
  // Lazy initializer, not useMemo — Math.random() is an impure call, and
  // useMemo's callback is expected to be idempotent under React's rules
  // (it can be re-invoked/discarded by the compiler). A lazy useState
  // initializer is documented as the right place for one-time impure
  // setup: it runs exactly once per mount, same guarantee this component
  // actually needs (same pattern as usePrefersReducedMotion's lazy init).
  const [positions] = useState(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 10
      arr[i * 3 + 1] = (Math.random() - 0.5) * 6
      arr[i * 3 + 2] = (Math.random() - 0.5) * 4
    }
    return arr
  })

  useFrame((state, delta) => {
    const p = points.current
    if (!p) return
    p.rotation.y += delta * 0.02
    const arr = p.geometry.attributes.position.array as Float32Array
    for (let i = 0; i < count; i++) {
      arr[i * 3 + 1] += delta * 0.15
      if (arr[i * 3 + 1] > 3) arr[i * 3 + 1] = -3
    }
    p.geometry.attributes.position.needsUpdate = true
  })

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.035} sizeAttenuation transparent opacity={0.7} />
    </points>
  )
}

export default function ParticleField({
  color = "#D8FF3E",
  count = 260,
  style,
}: {
  color?: string
  count?: number
  style?: React.CSSProperties
}) {
  return (
    <InViewCanvas style={{ pointerEvents: "none", ...style }} canvasProps={{ camera: { position: [0, 0, 5], fov: 50 } }}>
      <Scene color={color} count={count} />
    </InViewCanvas>
  )
}
