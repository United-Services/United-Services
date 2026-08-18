"use client"

import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"
import InViewCanvas from "./InViewCanvas"

// Real operating countries only (Egypt, Iraq, Saudi Arabia, UAE — the
// four PRODUCT.md/STATS actually name), placed at their approximate
// lat/long on a wireframe sphere. Not a literal atlas — a stylized globe
// like the 2D dot-map it replaces on Home's "2005 · 4 countries" card,
// just rendered as an actual 3D object instead of a flat canvas.
const MARKERS: { name: string; lat: number; lon: number }[] = [
  { name: "Egypt", lat: 26.8, lon: 30.8 },
  { name: "Iraq", lat: 33.2, lon: 43.7 },
  { name: "Saudi Arabia", lat: 23.9, lon: 45.1 },
  { name: "UAE", lat: 23.4, lon: 53.8 },
]

function toXYZ(lat: number, lon: number, r: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return [
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ]
}

function Scene({ dotColor, wireColor }: { dotColor: string; wireColor: string }) {
  const group = useRef<Group>(null)
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.18
  })

  const radius = 1.5

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[radius, 24, 18]} />
        <meshBasicMaterial color={wireColor} wireframe transparent opacity={0.35} />
      </mesh>
      {MARKERS.map((m) => (
        <mesh key={m.name} position={toXYZ(m.lat, m.lon, radius + 0.02)}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color={dotColor} />
        </mesh>
      ))}
      <ambientLight intensity={0.9} />
    </group>
  )
}

export default function RegionGlobe3D({
  dotColor = "#D8FF3E",
  wireColor = "#8C8C88",
  style,
}: {
  dotColor?: string
  wireColor?: string
  style?: React.CSSProperties
}) {
  return (
    <InViewCanvas style={style} canvasProps={{ camera: { position: [0, 0, 4.2], fov: 45 } }}>
      <Scene dotColor={dotColor} wireColor={wireColor} />
    </InViewCanvas>
  )
}
