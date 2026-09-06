// Shared source for the pipeline cross-section's five layers — used by
// Services.tsx's diagram and the homepage's services-preview card colors
// so both read as one system instead of two unrelated designs. Order
// matters: it's outside-in (wrap is the outermost layer, flow the core).
export const LAYER_KEYS = ["wrap", "coating", "steel", "lining", "flow"] as const
export type LayerKey = (typeof LAYER_KEYS)[number]

// `label` is the ink each bar's caption is set in. Services.tsx used a
// fixed white for all five, which measured 1.33:1 on the pale-blue flow
// layer ("PROTECTED" was unreadable) and failed AA on three of the other
// four. Per-layer ink: dark on the light/saturated fills, white only on
// the slate steel — 5.4:1 to 14.4:1 across the set.
export const LAYER_STYLE: Record<LayerKey, { color: string; width: string; label: string }> = {
  wrap: { color: "#EA580C", width: "100%", label: "#0E0E10" },
  coating: { color: "#FB923C", width: "88%", label: "#0E0E10" },
  steel: { color: "#475569", width: "76%", label: "#FFFFFF" },
  lining: { color: "#0EA5E9", width: "62%", label: "#0E0E10" },
  flow: { color: "#BAE6FD", width: "46%", label: "#0E0E10" },
}

// Maps a Service's slug (from the DB — see backend/prisma/seed.ts) to the
// pipeline layer it's most associated with, for tying the services-preview
// cards' color to this same system (Home.tsx). Not every service has a
// clean 1:1 layer — RTP systems and RTV insulator coating are real product
// lines but aren't one of these five cross-section layers (RTP is a pipe
// category of its own; RTV coating protects transmission-line insulators,
// a different domain from pipeline cross-sections entirely) — those two
// intentionally have no entry here rather than forcing a mismatch.
export const SERVICE_SLUG_TO_LAYER: Partial<Record<string, LayerKey>> = {
  "gre-tubular-lining": "lining",
  "hdpe-lining": "lining",
  "external-wrapping": "wrap",
  "industrial-coating": "coating",
}
