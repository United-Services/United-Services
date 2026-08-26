import { NextResponse } from "next/server"
import { shipLog } from "@/lib/betterstackLog"

// Server-side proxy for the browser's own console output — see
// instrumentation-client.ts, which posts here instead of writing to the
// real console. Exists purely so BETTERSTACK_SOURCE_TOKEN never has to
// reach client code: the browser sends level/message/context, this route
// (running server-side, with access to the real env vars) does the
// actual Betterstack ship.
//
// Deliberately NOT under /api/ — nginx/nginx.conf's `location /api/`
// proxies that entire prefix straight to the backend container, so a
// route here at /api/log would never actually be reached; it'd hit the
// backend's own 404 handler instead. /internal-log lives outside that
// prefix so nginx's `location /` (frontend) picks it up. Also excluded
// from next-intl's locale-prefix rewriting in proxy.ts, for the same
// reason any API-shaped route needs to be: it's not a page.
const ALLOWED_LEVELS = new Set(["log", "info", "warn", "error", "debug"])

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  const { level, message, context } = body as Record<string, unknown>
  const safeLevel = typeof level === "string" && ALLOWED_LEVELS.has(level) ? level : "log"
  const safeContext = typeof context === "string" ? context : "browser"

  shipLog(safeLevel, message, safeContext)

  // 204: the browser's console override treats this as fire-and-forget
  // and never inspects the response body.
  return new NextResponse(null, { status: 204 })
}
