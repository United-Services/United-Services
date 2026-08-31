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
      message: typeof message === "string" ? message : stringifyMessage(message),
      context,
      service: "frontend",
    }),
  }).catch(() => {
    // Never let log shipping itself throw or block whatever triggered it.
  })
}

// `JSON.stringify(someError)` produces "{}" — Error's own message/stack/
// name are non-enumerable, so a raw Error object (e.g. passed straight
// through from instrumentation-client.ts's own console.error override,
// or from a server-side `console.error(err)`) silently ships as an
// empty, undiagnosable "{}". Native Errors aren't the only offenders:
// many libraries (Clerk's SDK included) throw custom error classes that
// either don't properly extend Error, or that also define message/
// stack/code as non-enumerable getters — same masking either way.
// expandErrorLike() detects an error-like object by *property access*
// (works regardless of enumerability), not by `instanceof Error` or
// Object.keys/JSON.stringify (which only see enumerable own properties).
function stringifyMessage(message: unknown): string {
  try {
    return JSON.stringify(expandErrorLike(message))
  } catch {
    return String(message)
  }
}

function expandErrorLike(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(expandErrorLike)

  const obj = value as Record<string, unknown>
  const looksLikeError =
    value instanceof Error ||
    typeof obj.message === "string" ||
    typeof obj.stack === "string"
  if (!looksLikeError) return value

  const expanded: Record<string, unknown> = { ...obj }
  for (const key of ["name", "message", "stack", "code", "status", "statusCode"]) {
    if (obj[key] !== undefined) expanded[key] = obj[key]
  }
  if (obj.cause !== undefined) expanded.cause = expandErrorLike(obj.cause)
  return expanded
}
