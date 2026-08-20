// Shared source for the pipeline cross-section's five layers — used by
// Services.tsx's diagram and the homepage's services-preview card colors
// so both read as one system instead of two unrelated designs. Order
// matters: it's outside-in (wrap is the outermost layer, flow the core).
export const LAYER_KEYS = ["wrap", "coating", "steel", "lining", "flow"] as const
export type LayerKey = (typeof LAYER_KEYS)[number]

export const LAYER_STYLE: Record<LayerKey, { color: string; width: string }> = {
  wrap: { color: "#EA580C", width: "100%" },
  coating: { color: "#FB923C", width: "88%" },
  steel: { color: "#475569", width: "76%" },
  lining: { color: "#0EA5E9", width: "62%" },
  flow: { color: "#BAE6FD", width: "46%" },
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
