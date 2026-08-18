"use client"

// Real photography, self-hosted — offshore platform in daylight. Source
// credited in public/images/CREDITS.md (Wikimedia Commons, CC BY-SA 3.0).
// Plain <img>, not next/image — see frontend/AGENTS.md: this codebase's
// inline-style-driven layouts deliberately stay off next/image.
const PLATFORM_IMG = "/images/dc-hero-platform.jpg"

export default function Hero() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#0E0E10" }}>
      <img
        src={PLATFORM_IMG}
        alt="Offshore oil platform"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 40%",
        }}
      />
    </div>
  )
}
