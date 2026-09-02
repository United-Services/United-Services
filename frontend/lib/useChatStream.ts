import { useCallback, useState } from "react"
import { useAuth } from "@clerk/nextjs"

// The support-agent backend is a separate service (support-agent/backend
// in the repo root) from this site's own NestJS API — its own
// NEXT_PUBLIC_ var, not reused from lib/api.ts's NEXT_PUBLIC_API_URL.
const SUPPORT_AGENT_API_URL =
  process.env.NEXT_PUBLIC_SUPPORT_AGENT_API_URL ?? "http://localhost:8000"

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

// Mirrors support-agent/backend/app/routers/chat.py's SSE event shapes
// exactly — tool_start/tool_end let the UI show "Searching docs…"
// instead of silence between two bursts of text.
type StreamEvent =
  | { type: "tool_start"; tool: string }
  | { type: "tool_end"; tool: string }
  | { type: "token"; content: string }
  | { type: "done"; session_id: string }

export function useChatStream() {
  const { getToken } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  // Non-null while a tool is actively running.
  const [activeTool, setActiveTool] = useState<string | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    setMessages((prev) => [...prev, { role: "user", content: text }])
    setIsStreaming(true)
    setActiveTool(null)

    // Placeholder appended once, then mutated in place as token events
    // arrive — avoids re-creating the whole messages array (and
    // re-rendering every prior message) on every single token.
    setMessages((prev) => [...prev, { role: "assistant", content: "" }])

    try {
      // /chat/stream requires a signed-in visitor (see
      // support-agent/backend/app/security/clerk_auth.py) — ChatWidget
      // only renders this form once Clerk confirms isSignedIn, so
      // getToken() here should always resolve to a real session token.
      const token = await getToken()
      const response = await fetch(`${SUPPORT_AGENT_API_URL}/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`Request failed: ${response.status}`)
      }

      // EventSource can't send a POST body, so this is fetch + a manual
      // ReadableStream reader instead — SSE's own "data: ...\n\n" framing
      // parsed by hand rather than pulling in a dedicated SSE client
      // library for a format this simple.
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split("\n\n")
        buffer = events.pop() ?? "" // last (possibly incomplete) chunk stays buffered

        for (const raw of events) {
          const line = raw.trim()
          if (!line.startsWith("data:")) continue
          const event: StreamEvent = JSON.parse(line.slice("data:".length).trim())

          if (event.type === "tool_start") {
            setActiveTool(event.tool)
          } else if (event.type === "tool_end") {
            setActiveTool(null)
          } else if (event.type === "token") {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              next[next.length - 1] = { ...last, content: last.content + event.content }
              return next
            })
          }
          // "done" also carries session_id (now the Clerk user id) —
          // nothing to do with it client-side any more; identity comes
          // from the auth token on every request, not a stored value.
        }
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev]
        next[next.length - 1] = {
          role: "assistant",
          content: "Sorry, something went wrong reaching support. Please try again.",
        }
        return next
      })
    } finally {
      setIsStreaming(false)
      setActiveTool(null)
    }
  }, [getToken])

  return { messages, sendMessage, isStreaming, activeTool }
}
