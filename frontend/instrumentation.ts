// Next.js's official hook (register() runs once per server process,
// before it starts handling requests) — see
// node_modules/next/dist/docs/.../instrumentation.md. Used here to
// guarantee this app's server-side console output never reaches
// stdout/stderr: every console.* call is redirected to Betterstack
// instead, mirroring backend/src/logging/betterstack.logger.ts's
// "no console, ever" contract. NEXT_RUNTIME guards this to the Node.js
// runtime only — the Edge runtime doesn't have `console` patchable the
// same way and isn't used by this app's own request handling.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { shipLog } = await import("./lib/betterstackLog")

  const levels = ["log", "info", "warn", "error", "debug"] as const
  for (const level of levels) {
    console[level] = (...args: unknown[]) => {
      const message = args.length === 1 ? args[0] : args
      shipLog(level === "log" ? "info" : level, message, "server")
    }
  }
}

// Defense-in-depth for genuine unhandled server errors that bypass
// application-level try/catch (Server Components, Route Handlers,
// Server Actions) — Next's own official hook for this, separate from
// the console override above since these errors never go through
// console.error in the first place.
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
) {
  const { shipLog } = await import("./lib/betterstackLog")
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  shipLog(
    "error",
    stack ? `${request.method} ${request.path} -> ${message}\n${stack}` : `${request.method} ${request.path} -> ${message}`,
    "server-onRequestError",
  )
}
