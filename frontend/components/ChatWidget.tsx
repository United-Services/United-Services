"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { useUser } from "@clerk/nextjs"
import { palette } from "../theme"
import { useChatStream } from "../lib/useChatStream"
import { useAppNavigate } from "../lib/navigate"

const TOOL_LABELS: Record<string, string> = {
  search_knowledge_base: "Searching documentation…",
  create_ticket: "Filing a ticket…",
  get_ticket_status: "Looking up your ticket…",
  escalate_to_human: "Flagging this for a human…",
  get_current_time: "Checking the time…",
}

// The support chat widget — talks to the separate support-agent backend
// (support-agent/backend in the repo root), not this site's own NestJS
// API. Rendered as a floating launcher + panel here rather than the
// standalone iframe-embeddable build support-agent/frontend/ originally
// shipped as — same component, native to this app instead of a second
// deployed site.
export default function ChatWidget() {
  const { isLoaded, isSignedIn } = useUser()
  const navigate = useAppNavigate()
  const { messages, sendMessage, isStreaming, activeTool } = useChatStream()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, activeTool])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isStreaming) return
    setInput("")
    void sendMessage(text)
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 56,
          height: 56,
          borderRadius: 9999,
          border: "none",
          background: palette.accent,
          color: palette.navy,
          fontWeight: 800,
          fontSize: 22,
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          zIndex: 1000,
          fontFamily: "Poppins, sans-serif",
        }}
      >
        {open ? "×" : "💬"}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            bottom: 92,
            right: 24,
            width: 360,
            maxWidth: "calc(100vw - 32px)",
            height: 480,
            maxHeight: "calc(100vh - 140px)",
            background: "#fff",
            borderRadius: 16,
            border: `1px solid ${palette.border}`,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 1000,
            fontFamily: "Poppins, sans-serif",
          }}
        >
          <header
            style={{
              padding: "14px 16px",
              borderBottom: `1px solid ${palette.border}`,
              fontWeight: 700,
              fontSize: 14,
              color: palette.navy,
            }}
          >
            United Services Egypt — Support
          </header>

          {!isLoaded ? null : !isSignedIn ? (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                padding: 24,
                textAlign: "center",
              }}
            >
              <p style={{ color: palette.navy, fontSize: 13, lineHeight: 1.6 }}>
                Sign in to start a conversation with our support team.
              </p>
              <button
                onClick={() => navigate("client-login")}
                style={{
                  padding: "9px 20px",
                  borderRadius: 9999,
                  border: "none",
                  background: palette.accent,
                  color: palette.navy,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "Poppins, sans-serif",
                }}
              >
                Sign in
              </button>
            </div>
          ) : (
            <>
              <div
                ref={scrollRef}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {messages.length === 0 && (
                  <p style={{ color: palette.muted, fontSize: 13 }}>
                    Hi! Ask me about our services, or let me know if something&apos;s not working.
                  </p>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "85%",
                      background: m.role === "user" ? palette.accent : palette.bgAlt,
                      color: palette.navy,
                      borderRadius: 14,
                      padding: "9px 13px",
                      fontSize: 13,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {m.content || (isStreaming && i === messages.length - 1 ? "…" : "")}
                  </div>
                ))}
                {activeTool && (
                  <div style={{ alignSelf: "flex-start", fontSize: 12, color: palette.muted, fontStyle: "italic" }}>
                    {TOOL_LABELS[activeTool] ?? `Running ${activeTool}…`}
                  </div>
                )}
              </div>

              <form
                onSubmit={handleSubmit}
                style={{
                  display: "flex",
                  gap: 8,
                  padding: 12,
                  borderTop: `1px solid ${palette.border}`,
                }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type your message…"
                  disabled={isStreaming}
                  style={{
                    flex: 1,
                    padding: "9px 12px",
                    borderRadius: 9999,
                    border: `1.5px solid ${palette.border}`,
                    fontSize: 13,
                    outline: "none",
                    fontFamily: "Poppins, sans-serif",
                  }}
                />
                <button
                  type="submit"
                  disabled={isStreaming || !input.trim()}
                  style={{
                    padding: "9px 16px",
                    borderRadius: 9999,
                    border: "none",
                    background: isStreaming ? "#9CA3AF" : palette.accent,
                    color: palette.navy,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: isStreaming ? "default" : "pointer",
                    fontFamily: "Poppins, sans-serif",
                  }}
                >
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  )
}
