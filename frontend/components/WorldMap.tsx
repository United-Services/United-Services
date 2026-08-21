"use client"

// Choropleth world map — colors each country by request volume (from
// AnalyticsEvent rows tagged server-side by GeoService, never
// client-reported). Static topojson served from /public/data — no
// external network fetch at render time.

import { useMemo, useState } from "react"
import { ComposableMap, Geographies, Geography } from "react-simple-maps"
import type { ComponentProps } from "react"

type GeographiesRenderArg = Parameters<NonNullable<ComponentProps<typeof Geographies>["children"]>>[0]
import { palette } from "../theme"
import { ISO_NUMERIC_TO_ALPHA2 } from "../data/iso-numeric-to-alpha2"

const GEO_URL = "/data/world-countries-110m.json"

interface CountryCount {
  country: string
  count: number
}

interface Props {
  data: CountryCount[]
  noDataLabel: string
  requestsLabel: string
}
export default function WorldMap({ data, noDataLabel, requestsLabel }: Props) {
  const [hovered, setHovered] = useState<{
    name: string
    count: number
    x: number
    y: number
  } | null>(null)

  const countsByAlpha2 = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of data) map.set(row.country, row.count)
    return map
  }, [data])

  const maxCount = useMemo(
    () => Math.max(1, ...data.map((d) => d.count)),
    [data],
  )

  const colorFor = (count: number) => {
    if (count <= 0) return "#F3F2EE"
    const intensity = 0.25 + 0.75 * (count / maxCount)
    return `color-mix(in srgb, ${palette.accent} ${Math.round(intensity * 100)}%, ${palette.accentLight})`
  }

  return (
    <div style={{ position: "relative" }}>
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 120, center: [10, 20] }}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }: GeographiesRenderArg) =>
            geographies.map((geo) => {
              const alpha2 = ISO_NUMERIC_TO_ALPHA2[(geo.id as string)]
              const count = alpha2 ? (countsByAlpha2.get(alpha2) ?? 0) : 0
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  onMouseEnter={(evt: React.MouseEvent) => {
                    setHovered({
                      name: geo.properties.name,
                      count,
                      x: evt.clientX,
                      y: evt.clientY,
                    })
                  }}
                  onMouseMove={(evt: React.MouseEvent) => {
                    setHovered((prev) =>
                      prev ? { ...prev, x: evt.clientX, y: evt.clientY } : prev,
                    )
                  }}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    default: {
                      fill: colorFor(count),
                      stroke: "#fff",
                      strokeWidth: 0.5,
                      outline: "none",
                    },
                    hover: {
                      fill: palette.accentDark,
                      stroke: "#fff",
                      strokeWidth: 0.5,
                      outline: "none",
                      cursor: "pointer",
                    },
                    pressed: {
                      fill: palette.accentDark,
                      stroke: "#fff",
                      strokeWidth: 0.5,
                      outline: "none",
                    },
                  }}
                />
              )
            })
          }
        </Geographies>
      </ComposableMap>

      {hovered && (
        <div
          style={{
            position: "fixed",
            left: hovered.x + 14,
            top: hovered.y + 14,
            zIndex: 50,
            background: palette.navy,
            color: "#fff",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 600,
            pointerEvents: "none",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            whiteSpace: "nowrap",
          }}
        >
          {hovered.name} —{" "}
          {hovered.count > 0
            ? `${hovered.count} ${requestsLabel}`
            : noDataLabel}
        </div>
      )}
    </div>
  )
}
