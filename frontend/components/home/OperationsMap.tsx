"use client"

import { useState } from "react"
import { ComposableMap, Geographies, Geography } from "react-simple-maps"
import type { ComponentProps } from "react"
import { geoMercator } from "d3-geo"
import { motion } from "framer-motion"
import { useTranslations } from "next-intl"
import { palette } from "../../theme"
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion"

type GeographiesRenderArg = Parameters<
  NonNullable<ComponentProps<typeof Geographies>["children"]>
>[0]

const GEO_URL = "/data/world-countries-110m.json"
const WIDTH = 800
const HEIGHT = 600
const CENTER: [number, number] = [42, 27]
const SCALE = 850

// Capital-city coordinates, close enough for a stylized operations map —
// not a claim of precise facility locations.
const EGYPT: [number, number] = [31.2357, 30.0444] // Cairo — HQ
const OTHERS: { name: string; coords: [number, number] }[] = [
  { name: "Iraq", coords: [44.3661, 33.3152] }, // Baghdad
  { name: "Qatar", coords: [51.531, 25.2854] }, // Doha
  { name: "United Arab Emirates", coords: [54.3773, 24.4539] }, // Abu Dhabi
]
const HIGHLIGHTED = new Set(["Egypt", "Iraq", "Qatar", "United Arab Emirates"])

const projection = geoMercator()
  .center(CENTER)
  .scale(SCALE)
  .translate([WIDTH / 2, HEIGHT / 2])

export default function OperationsMap() {
  const t = useTranslations("home.world")
  const reducedMotion = usePrefersReducedMotion()
  const [activePin, setActivePin] = useState<string | null>(null)

  const egyptXY = projection(EGYPT) ?? [0, 0]

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `linear-gradient(180deg, #0B1220 0%, ${palette.navy} 100%)`,
      }}
    >
      <ComposableMap
        width={WIDTH}
        height={HEIGHT}
        projection="geoMercator"
        projectionConfig={{ scale: SCALE, center: CENTER }}
        style={{ width: "100%", height: "100%" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }: GeographiesRenderArg) =>
            geographies.map((geo) => {
              const name = geo.properties.name as string
              const highlighted = HIGHLIGHTED.has(name)
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  style={{
                    default: {
                      fill: highlighted ? "rgba(234,88,12,0.22)" : "#1E293B",
                      stroke: highlighted ? palette.accent : "#334155",
                      strokeWidth: highlighted ? 1 : 0.5,
                      outline: "none",
                    },
                    hover: { fill: highlighted ? "rgba(234,88,12,0.32)" : "#1E293B", outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              )
            })
          }
        </Geographies>

        {}
        {OTHERS.map((c) => {
          const [x, y] = projection(c.coords) ?? [0, 0]
          const pathD = `M${egyptXY[0]},${egyptXY[1]} Q${(egyptXY[0] + x) / 2},${Math.min(egyptXY[1], y) - 40} ${x},${y}`
          return (
            <motion.path
              key={c.name}
              d={pathD}
              fill="none"
              stroke={palette.accent}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 0.7 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 1.1, ease: "easeInOut" }}
            />
          )
        })}

        {}
        {OTHERS.map((c) => {
          const [x, y] = projection(c.coords) ?? [0, 0]
          return (
            <g key={c.name}>
              <circle
                cx={x}
                cy={y}
                r={5}
                fill={palette.navy}
                stroke={palette.accent}
                strokeWidth={1.5}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setActivePin(c.name)}
                onMouseLeave={() => setActivePin(null)}
                onClick={() => setActivePin((p) => (p === c.name ? null : c.name))}
              />
              {activePin === c.name && (
                <foreignObject x={x + 10} y={y - 16} width={160} height={44}>
                  <div
                    style={{
                      background: "rgba(15,23,42,0.95)",
                      border: "1px solid rgba(234,88,12,0.4)",
                      borderRadius: 8,
                      padding: "6px 10px",
                      fontSize: 11,
                      color: "#fff",
                      fontFamily: "Poppins, sans-serif",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    <div style={{ color: "#94A3B8" }}>{t("operationsLabel")}</div>
                  </div>
                </foreignObject>
              )}
            </g>
          )
        })}

        {}
        <g
          style={{ cursor: "pointer" }}
          onMouseEnter={() => setActivePin("Egypt")}
          onMouseLeave={() => setActivePin(null)}
          onClick={() => setActivePin((p) => (p === "Egypt" ? null : "Egypt"))}
        >
          {!reducedMotion && (
            <motion.circle
              cx={egyptXY[0]}
              cy={egyptXY[1]}
              fill="none"
              stroke={palette.accent}
              strokeWidth={1.5}
              initial={{ r: 6, opacity: 0.8 }}
              animate={{ r: [6, 16, 6], opacity: [0.8, 0, 0.8] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          <circle cx={egyptXY[0]} cy={egyptXY[1]} r={7} fill={palette.accent} />
          {activePin === "Egypt" && (
            <foreignObject x={egyptXY[0] + 12} y={egyptXY[1] - 18} width={190} height={48}>
              <div
                style={{
                  background: "rgba(15,23,42,0.95)",
                  border: "1px solid rgba(234,88,12,0.5)",
                  borderRadius: 8,
                  padding: "7px 11px",
                  fontSize: 11,
                  color: "#fff",
                  fontFamily: "Poppins, sans-serif",
                  whiteSpace: "nowrap",
                }}
              >
                <div style={{ fontWeight: 700 }}>{t("hqLabel")}</div>
                <div style={{ color: "#94A3B8" }}>{t("hqFounded")}</div>
              </div>
            </foreignObject>
          )}
        </g>
      </ComposableMap>
    </div>
  )
}
