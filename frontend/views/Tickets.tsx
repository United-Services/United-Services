"use client"

import { useState } from "react"
import PublicNav from "../components/PublicNav"
import PublicFooter from "../components/PublicFooter"
import { InlineSpinner } from "../components/Spinner"
import { axios } from "../lib/api"
import { TEXT, MUTED, LIME, HEAD, BODY, PublicTag, publicBtnLime } from "../lib/publicTheme"

type TicketType = "technical" | "disabled_account" | "non_technical"

interface Props {
  onNavigate: (page: string, param?: string) => void
  initialType?: TicketType | null
}

const TYPE_OPTIONS: { value: TicketType; label: string; desc: string }[] = [
  {
    value: "technical",
    label: "Technical issue",
    desc: "Something is broken or not working as expected.",
  },
  {
    value: "disabled_account",
    label: "My account is disabled",
    desc: "You believe your account was disabled by mistake.",
  },
  {
    value: "non_technical",
    label: "Something else",
    desc: "A general question or non-technical concern.",
  },
]

const ALLOWED_SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 10,
  border: "1.5px solid #E6E5E0",
  fontSize: 14,
  fontFamily: BODY,
  outline: "none",
}

export default function Tickets({ onNavigate, initialType }: Props) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    type: (initialType ?? "technical") as TicketType,
    details: "",
  })
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [screenshotError, setScreenshotError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const onScreenshotSelected = (file: File) => {
    setScreenshotError(null)
    if (!ALLOWED_SCREENSHOT_TYPES.includes(file.type)) {
      setScreenshotError("Unsupported file format — please attach a JPG, PNG, or WebP screenshot.")
      return
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setScreenshotError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB) — the limit is 5MB.`)
      return
    }
    setScreenshot(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      let screenshotS3Key: string | undefined
      if (screenshot) {
        const { data: presign } = await axios.post("/tickets/presign", {
          contentType: screenshot.type,
        })
        await fetch(presign.url, {
          method: "PUT",
          body: screenshot,
          headers: { "Content-Type": screenshot.type },
        })
        screenshotS3Key = presign.key
      }
      await axios.post("/tickets", {
        name: form.name,
        email: form.email,
        company: form.company || undefined,
        type: form.type,
        details: form.details,
        screenshotS3Key,
      })
      setDone(true)
    } catch {
      setError("Something went wrong submitting your report — please try again in a moment.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ fontFamily: BODY }}>
      <PublicNav current="tickets" onNavigate={onNavigate} />

      <section style={{ padding: "140px 28px 100px", maxWidth: 720, margin: "0 auto" }}>
        <PublicTag>Support</PublicTag>
        <h1
          style={{
            margin: "22px 0 12px",
            fontFamily: HEAD,
            fontWeight: 700,
            fontSize: "clamp(32px, 4.5vw, 48px)",
            color: TEXT,
            letterSpacing: "-0.01em",
          }}
        >
          Report a problem
        </h1>
        <p style={{ margin: "0 0 40px", fontSize: 15, lineHeight: 1.7, color: MUTED, maxWidth: 520 }}>
          Tell us what happened and we&apos;ll get back to you. If your account was disabled and you
          believe that&apos;s a mistake, let us know below.
        </p>

        {done ? (
          <div
            style={{
              background: "#F0FDF4",
              border: "1.5px solid #86EFAC",
              borderRadius: 16,
              padding: 28,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "#166534", marginBottom: 6 }}>
              Thanks — we received your report.
            </div>
            <p style={{ margin: 0, fontSize: 14, color: "#15803D", lineHeight: 1.6 }}>
              We&apos;ll reach out at the email you provided as soon as we can.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
                  Name
                </label>
                <input value={form.name} onChange={set("name")} required style={inputStyle} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
                  Email
                </label>
                <input type="email" value={form.email} onChange={set("email")} required style={inputStyle} />
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
                Company <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span>
              </label>
              <input value={form.company} onChange={set("company")} style={inputStyle} />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 10 }}>
                What&apos;s the issue?
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {TYPE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "14px 16px",
                      borderRadius: 12,
                      border: `1.5px solid ${form.type === opt.value ? LIME : "#E6E5E0"}`,
                      background: form.type === opt.value ? "#FBFFEF" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="type"
                      checked={form.type === opt.value}
                      onChange={() => setForm((f) => ({ ...f, type: opt.value }))}
                      style={{ marginTop: 3 }}
                    />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{opt.label}</div>
                      <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
                Details
              </label>
              <textarea
                value={form.details}
                onChange={set("details")}
                required
                rows={6}
                maxLength={2000}
                placeholder="What happened? Include any steps to reproduce, if relevant."
                style={{ ...inputStyle, resize: "vertical", fontFamily: BODY }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
                Screenshot <span style={{ color: MUTED, fontWeight: 400 }}>(optional)</span>
              </label>
              {screenshot ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13, color: TEXT }}>
                  <span>{screenshot.name}</span>
                  <button
                    type="button"
                    onClick={() => setScreenshot(null)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#DC2626",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 18px",
                    borderRadius: 9999,
                    border: "1.5px dashed #E6E5E0",
                    fontSize: 13,
                    fontWeight: 600,
                    color: MUTED,
                    cursor: "pointer",
                  }}
                >
                  Attach a screenshot
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: "none" }}
                    onChange={(e) => e.target.files?.[0] && onScreenshotSelected(e.target.files[0])}
                  />
                </label>
              )}
              {screenshotError && (
                <div style={{ fontSize: 12.5, color: "#DC2626", marginTop: 6, fontWeight: 600 }}>
                  {screenshotError}
                </div>
              )}
            </div>

            {error && (
              <div style={{ fontSize: 13, color: "#DC2626", fontWeight: 600 }}>{error}</div>
            )}

            <button type="submit" disabled={submitting} style={{ ...publicBtnLime, alignSelf: "flex-start" }}>
              {submitting ? (
                <>
                  <InlineSpinner size={14} /> Submitting...
                </>
              ) : (
                "Submit report"
              )}
            </button>
          </form>
        )}
      </section>

      <PublicFooter onNavigate={onNavigate} />
    </div>
  )
}
