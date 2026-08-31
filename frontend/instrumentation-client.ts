// Next.js's client-side instrumentation convention — runs synchronously
// after the HTML loads, before hydration (see
// node_modules/next/dist/docs/.../instrumentation-client.md). Redirects
// every browser console.* call to this app's own /internal-log route instead
// of writing to the real console — that route ships to Betterstack
// server-side, keeping BETTERSTACK_SOURCE_TOKEN out of client code
// entirely. Same "no console, ever" contract as the backend and the
// server-side instrumentation.ts.
const levels = ["log", "info", "warn", "error", "debug"] as const

for (const level of levels) {
  console[level] = (...args: unknown[]) => {
    const message = args.length === 1 ? args[0] : args
    const payload = {
      level: level === "log" ? "info" : level,
      message: typeof message === "string" ? message : safeStringify(message),
      context: "browser",
    }
    // Fire-and-forget, deliberately not awaited — this must never block
    // or slow down whatever triggered the log. keepalive lets it survive
    // a page unload that happens right after (e.g. logging just before
    // navigating away).
    fetch("/internal-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // No fallback to console here on purpose — the whole point is
      // that nothing writes there, even when shipping itself fails.
    })
  }
}

// `JSON.stringify(someError)` produces "{}" — Error's own message/stack/
// name are non-enumerable, so plain JSON.stringify silently discards
// them. Native Errors aren't the only offenders: many libraries (Clerk's
// SDK included) throw custom error classes that either don't properly
// extend Error, or that also define message/stack/code as
// non-enumerable getters — either way, the same "{}" masking happens.
// expandErrorLike() detects an error-like object by *property access*
// (works regardless of enumerability), not by `instanceof Error` or
// Object.keys/JSON.stringify (which only see enumerable own properties),
// so it catches both native Errors and library-specific error shapes.
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(expandErrorLike(value))
  } catch {
    return String(value)
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

  // Spreading first captures whatever enumerable custom fields the
  // object has (e.g. extra context a caller attached); the explicit
  // re-reads afterward recover name/message/stack/code/status even when
  // the object defines them as non-enumerable, which is exactly what a
  // plain spread — or JSON.stringify — would otherwise silently drop.
  const expanded: Record<string, unknown> = { ...obj }
  for (const key of ["name", "message", "stack", "code", "status", "statusCode"]) {
    if (obj[key] !== undefined) expanded[key] = obj[key]
  }
  if (obj.cause !== undefined) expanded.cause = expandErrorLike(obj.cause)
  return expanded
}
