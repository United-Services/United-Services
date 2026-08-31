import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

describe("shipLog", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    process.env.BETTERSTACK_INGEST_URL = "https://ingest.example.com"
    process.env.BETTERSTACK_SOURCE_TOKEN = "test-token"
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.BETTERSTACK_INGEST_URL
    delete process.env.BETTERSTACK_SOURCE_TOKEN
  })

  async function bodyOf(call: number = 0) {
    const raw = fetchMock.mock.calls[call][1].body as string
    return JSON.parse(raw)
  }

  it("ships a plain string message unchanged", async () => {
    const { shipLog } = await import("./betterstackLog")
    shipLog("info", "hello")

    const body = await bodyOf()
    expect(body.message).toBe("hello")
  })

  // Regression: JSON.stringify(someError) produces "{}" — Error's own
  // name/message/stack are non-enumerable, so a bare Error object as the
  // message (e.g. instrumentation.ts's server console.error(err)
  // passthrough) used to silently ship as an empty, undiagnosable "{}".
  it("expands a bare Error into name/message/stack instead of shipping {}", async () => {
    const { shipLog } = await import("./betterstackLog")
    const err = new Error("database connection refused")
    shipLog("error", err)

    const body = await bodyOf()
    expect(body.message).not.toBe("{}")
    const shipped = JSON.parse(body.message)
    expect(shipped.name).toBe("Error")
    expect(shipped.message).toBe("database connection refused")
    expect(shipped.stack).toContain("Error: database connection refused")
  })

  it("follows a chained `cause` Error", async () => {
    const { shipLog } = await import("./betterstackLog")
    const root = new Error("ECONNREFUSED")
    const wrapped = new Error("failed to connect", { cause: root })
    shipLog("error", wrapped)

    const body = await bodyOf()
    const shipped = JSON.parse(body.message)
    expect(shipped.message).toBe("failed to connect")
    expect(shipped.cause.message).toBe("ECONNREFUSED")
  })

  it("expands an Error nested inside an array (console.error('context', err) shape)", async () => {
    const { shipLog } = await import("./betterstackLog")
    shipLog("error", ["request failed", new Error("timeout")])

    const body = await bodyOf()
    const shipped = JSON.parse(body.message)
    expect(shipped[0]).toBe("request failed")
    expect(shipped[1].message).toBe("timeout")
  })

  it("still ships a genuinely plain object unchanged (no message/stack property)", async () => {
    const { shipLog } = await import("./betterstackLog")
    shipLog("info", { some: "plain", data: 1 })

    const body = await bodyOf()
    expect(JSON.parse(body.message)).toEqual({ some: "plain", data: 1 })
  })

  // Regression for the real incident this fix was written for: accessing
  // the app over plain HTTP on a LAN IP (non-secure context) surfaced
  // Clerk SDK errors that aren't `instanceof Error` and still shipped as
  // "{}" even after the first round of this fix. Detecting error-shaped
  // objects by property access (works regardless of class hierarchy or
  // enumerability) catches this.
  it("expands a non-Error object that merely looks like an error (has a message property)", async () => {
    const { shipLog } = await import("./betterstackLog")
    class ClerkStyleError {
      constructor(
        public message: string,
        public status: number,
      ) {}
    }
    shipLog("error", new ClerkStyleError("session not found", 401))

    const body = await bodyOf()
    expect(body.message).not.toBe("{}")
    const shipped = JSON.parse(body.message)
    expect(shipped.message).toBe("session not found")
    expect(shipped.status).toBe(401)
  })

  it("recovers a non-enumerable message property that plain JSON.stringify would silently drop", async () => {
    const { shipLog } = await import("./betterstackLog")
    const weirdError: Record<string, unknown> = {}
    Object.defineProperty(weirdError, "message", {
      value: "hidden from JSON.stringify",
      enumerable: false,
    })
    expect(JSON.stringify(weirdError)).toBe("{}")

    shipLog("error", weirdError)
    const body = await bodyOf()
    expect(JSON.parse(body.message).message).toBe("hidden from JSON.stringify")
  })

  it("silently drops the log when Betterstack isn't configured, never throwing", async () => {
    delete process.env.BETTERSTACK_INGEST_URL
    delete process.env.BETTERSTACK_SOURCE_TOKEN
    const { shipLog } = await import("./betterstackLog")

    expect(() => shipLog("error", new Error("boom"))).not.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
