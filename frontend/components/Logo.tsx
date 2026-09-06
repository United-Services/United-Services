"use client"
import { useId } from "react"

// Droplet mark — geometry unchanged from the original artwork
// (public/images/logo.svg, now unused/removed in favor of this
// component: real DOM text renders crisply at every size and uses the
// site's own loaded webfont, where a static SVG would have needed a
// baked-in font fallback that could visibly mismatch the real one).
const DROP_PATH =
  "M100 18 C 106 58, 152 94, 152 140 A 52 52 0 0 1 48 140 C 48 94, 94 58, 100 18 Z"
const GLOSS_PATH =
  "M74 112 C 66 128, 68 150, 82 158 C 92 150, 92 128, 88 116 C 84 108, 78 106, 74 112 Z"

const DARK = "#0A0A0A"
const NAVY = "#1B2A3A"
const BLUE = "#0A6EBD"
// Brighter than BLUE — the given #0A6EBD measures ~3.6:1 against the
// site's dark surfaces (#0E0E10), under the 4.5:1 small-text floor. A
// logotype's own brand colors are exempt from WCAG contrast (see
// "Understanding SC 1.4.3" — logos are explicitly excluded), but this
// is cheap to fix without touching the identity: same hue, lighter.
const BLUE_ON_DARK = "#5EC2FF"

export interface LogoProps {
  /** Icon height in px — the wordmark/tagline scale to match. */
  size?: number
  /** "dark" (default): dark icon + navy text, for light backgrounds
   *  (PublicNav). "light": white icon + white text, for dark
   *  backgrounds (PublicFooter — #0E0E10). */
  variant?: "dark" | "light"
  /** Hides the "Petroleum Services" tagline line. Used in the
   *  admin/client dashboard sidebars: those are a fixed 220px and
   *  already show their own text label ("Admin Panel"/"Client
   *  Portal"), so the full two-line lockup would crowd or wrap it and
   *  reads as redundant next to it. */
  tagline?: boolean
  className?: string
}

// Proportions from the reference lockup (icon size 68, name 1.9rem/30.4px,
// tagline 0.8rem/12.8px, gap 16px) — scaled from `size` so the wordmark
// stays visually consistent whether it's rendered at nav height (~40px)
// or footer height (~48px), not just correct at one fixed size.
const NAME_RATIO = 30.4 / 68
const TAGLINE_RATIO = 12.8 / 68
const GAP_RATIO = 16 / 68

export default function Logo({
  size = 44,
  variant = "dark",
  tagline = true,
  className,
}: LogoProps) {
  const clipId = useId()
  const iconFill = variant === "dark" ? DARK : "#FFFFFF"
  const glossFill = variant === "dark" ? "#FFFFFF" : DARK
  const nameColor = variant === "dark" ? NAVY : "#FFFFFF"
  const taglineColor = variant === "dark" ? BLUE : BLUE_ON_DARK

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: size * GAP_RATIO }}
    >
      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        role="img"
        aria-label="United Services Egypt"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={DROP_PATH} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="0" width="200" height="200" fill={iconFill} />
          <path d={GLOSS_PATH} fill={glossFill} opacity="0.16" />
        </g>
      </svg>
      <span aria-hidden="true" style={{ lineHeight: 1 }}>
        <div
          style={{
            fontFamily: "var(--font-barlow-condensed), sans-serif",
            fontWeight: 700,
            fontSize: size * NAME_RATIO,
            letterSpacing: "0.06em",
            lineHeight: 1,
            textTransform: "uppercase",
            color: nameColor,
            whiteSpace: "nowrap",
          }}
        >
          United Services Egypt
        </div>
        {tagline && (
          <div
            style={{
              fontFamily: "var(--font-barlow), sans-serif",
              fontWeight: 500,
              fontSize: size * TAGLINE_RATIO,
              letterSpacing: "0.34em",
              textTransform: "uppercase",
              color: taglineColor,
              marginTop: size * 0.09,
              whiteSpace: "nowrap",
            }}
          >
            Petroleum Services
          </div>
        )}
      </span>
    </span>
  )
}
