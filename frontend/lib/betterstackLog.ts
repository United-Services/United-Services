import { serializeForLog } from "./serializeForLog"

// Server-only. Mirrors backend/src/logging/betterstack.logger.ts's
// shipping shape (same Betterstack ingest contract), service: 'frontend'
// so the two are distinguishable in Betterstack. Never called from the
// browser directly — BETTERSTACK_SOURCE_TOKEN must never reach client
// code, which is why the browser posts to this app's own /api/log route
// instead (see instrumentation-client.ts) and this module ships from
// there, server-side.
export function shipLog(level: string, message: unknown, context?: string): void {
  const ingestUrl = process.env.BETTERSTACK_INGEST_URL
  const token = process.env.BETTERSTACK_SOURCE_TOKEN
  // Silently drops when unconfigured — same accepted tradeoff as the
  // backend's BetterstackLogger: nothing ever falls back to the console.
  if (!ingestUrl || !token) return

  fetch(ingestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      dt: new Date().toISOString().replace("T", " ").replace("Z", " UTC"),
      level,
      message:
        typeof message === "string" ? message : JSON.stringify(serializeForLog(message)),
      context,
      service: "frontend",
    }),
  }).catch(() => {
    // Never let log shipping itself throw or block whatever triggered it.
  })
}
