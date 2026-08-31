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
// them. That's the exact bug this function existed to prevent, and
// didn't: a raw `console.error(err)` (React's own error boundary logging
// does this) shipped as an empty, undiagnosable "{}" instead of the
// actual error. Expand Error instances (recursively through `cause`)
// before falling back to plain JSON.stringify for everything else.
function safeStringify(value: unknown): string {
  try {
    if (value instanceof Error) return JSON.stringify(serializeError(value))
    if (Array.isArray(value) && value.some((v) => v instanceof Error)) {
      return JSON.stringify(
        value.map((v) => (v instanceof Error ? serializeError(v) : v)),
      )
    }
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function serializeError(err: Error): Record<string, unknown> {
  return {
    name: err.name,
    message: err.message,
    stack: err.stack,
    ...(err.cause instanceof Error
      ? { cause: serializeError(err.cause) }
      : err.cause !== undefined
        ? { cause: err.cause }
        : {}),
  }
}
