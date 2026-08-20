"use client"

import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"
import InViewCanvas from "./InViewCanvas"
import { LAYER_KEYS, LAYER_STYLE } from "../../lib/pipelineLayers"

// Concentric rings, one per pipeline layer, using the same LAYER_STYLE
// colors as Services.tsx's flat bar diagram and Home's service-card tints
// — this is the one recurring visual system (see lib/pipelineLayers.ts),
// rendered as an actual cross-section instead of a 2D bar this time.
// Radii scale down from wrap (outermost) to flow (the bore) to match the
// real outside-in order the layer keys are already defined in.
function Scene() {
  const group = useRef<Group>(null)
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.25
  })

  const radii = LAYER_KEYS.map((_, i) => 1.6 - i * 0.28)

  return (
    <group ref={group} rotation={[0.5, 0, 0]}>
      {LAYER_KEYS.map((key, i) => (
        <mesh key={key} position={[0, 0, 0]}>
          <cylinderGeometry args={[radii[i], radii[i], 0.5, 48, 1, true]} />
          <meshStandardMaterial
            color={LAYER_STYLE[key].color}
            side={2}
            transparent
            opacity={0.92}
            roughness={0.4}
            metalness={0.15}
          />
        </mesh>
      ))}
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
    </group>
  )
}

export default function PipeCrossSection3D({ style }: { style?: React.CSSProperties }) {
  return (
    <InViewCanvas style={style} canvasProps={{ camera: { position: [0, 1.5, 5], fov: 45 } }}>
      <Scene />
    </InViewCanvas>
  )
}
