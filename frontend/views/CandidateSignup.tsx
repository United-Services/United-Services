"use client"
import { useState } from "react"
import { useSignUp, useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { InlineSpinner } from "../components/Spinner"
import { axios, authHeader } from "../lib/api"
import PublicNav from "../components/PublicNav"
import { PAPER, TEXT, MUTED, LIME, HEAD, BODY } from "../lib/publicTheme"
import OtpInput from "../components/OtpInput"

interface Props {
  onNavigate: (page: string) => void
  positionId?: string | null
}

const fieldInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "13px 16px",
  borderRadius: 14,
  border: "1.5px solid #E6E5E0",
  fontSize: 15,
  color: TEXT,
  background: "#fff",
  outline: "none",
  transition: "border-color 0.2s",
  boxSizing: "border-box",
  fontFamily: BODY,
}

export default function CandidateSignup({ onNavigate, positionId }: Props) {
  const { signUp } = useSignUp()
  const { getToken } = useAuth()
  const t = useTranslations("candidateSignup")
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    dob: "",
    email: "",
    password: "",
  })
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"form" | "verify">("form")
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error: createError } = await signUp.password({
        emailAddress: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
      })
      if (createError) {
        setError(createError.message ?? t("errors.createFailed"))
        return
      }
      const { error: codeError } = await signUp.verifications.sendEmailCode()
      if (codeError) {
        setError(codeError.message ?? t("errors.codeFailed"))
        return
      }
      setStep("verify")
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { error: verifyError } = await signUp.verifications.verifyEmailCode(
        { code },
      )
      if (verifyError) {
        setError(verifyError.message ?? t("errors.invalidCode"))
        return
      }
      const { error: finalizeError } = await signUp.finalize()
      if (finalizeError) {
        setError(finalizeError.message ?? t("errors.finalizeFailed"))
        return
      }

      const token = await getToken()
      await axios.post(
        "/me/become-candidate",
        {
          dateOfBirth: form.dob,
          ...(positionId ? { positionId } : {}),
        },
        { headers: authHeader(token) },
      )

      setSubmitted(true)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t("errors.submitFailed"))
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div style={{ fontFamily: BODY, color: TEXT }}>
        <PublicNav current="candidate-signup" onNavigate={onNavigate} />
        <div
          style={{
            marginTop: 68,
            minHeight: "calc(100vh - 68px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: PAPER,
            padding: 24,
          }}
        >
        <div
          style={{
            maxWidth: 520,
            width: "100%",
            background: "#fff",
            borderRadius: 24,
            padding: "64px 48px",
            border: "1px solid #E6E5E0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: PAPER,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              margin: "0 auto 24px",
            }}
          >
            ⏳
          </div>
          <h2
            style={{
              fontFamily: HEAD,
              fontSize: 26,
              fontWeight: 600,
              color: TEXT,
              marginBottom: 12,
              letterSpacing: "-0.01em",
            }}
          >
            {t("submitted.title")}
          </h2>
          <p
            style={{
              fontSize: 14,
              color: MUTED,
              lineHeight: 1.8,
              marginBottom: 32,
            }}
          >
            {t.rich("submitted.body", {
              firstName: form.firstName,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
            <br />
            {t.rich("submitted.notify", {
              email: form.email,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <div
            style={{
              background: PAPER,
              borderRadius: 14,
              padding: "20px 24px",
              marginBottom: 32,
              textAlign: "left",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: TEXT,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              {t("submitted.whatsNext")}
            </div>
            {[
              t("submitted.step1"),
              t("submitted.step2"),
              t("submitted.step3"),
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: 10,
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: LIME,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: TEXT,
                    fontWeight: 700,
                    fontSize: 10,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: MUTED,
                    lineHeight: 1.5,
                  }}
                >
                  {s}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => onNavigate("candidate-dashboard")}
            style={{
              background: TEXT,
              color: "#fff",
              border: "none",
              borderRadius: 9999,
              padding: "12px 32px",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: BODY,
            }}
          >
            {t("goToDashboard")}
          </button>
        </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: BODY, color: TEXT }}>
      {/* Clerk manages this element itself (sizes/renders the CAPTCHA
          widget into it when a challenge is required) — without it present
          in the DOM before signUp.password() is called, Clerk silently
          falls back to a weaker invisible-only check instead of erroring,
          so it's easy to miss. See Clerk's custom-flow bot-protection docs. */}
      <div id="clerk-captcha" />
      <PublicNav current="candidate-signup" onNavigate={onNavigate} />
      <div
        style={{
          marginTop: 68,
          minHeight: "calc(100vh - 68px)",
          background: PAPER,
          padding: "40px 24px",
        }}
      >
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: "48px",
            border: "1px solid #E6E5E0",
          }}
        >
          <h1
            style={{
              fontFamily: HEAD,
              fontSize: 28,
              fontWeight: 600,
              color: TEXT,
              marginBottom: 8,
              letterSpacing: "-0.01em",
            }}
          >
            {t("title")}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: MUTED,
              marginBottom: 36,
              lineHeight: 1.6,
            }}
          >
            {t("subtitle")}
          </p>

          {step === "verify" ? (
            <form onSubmit={handleVerify}>
              <p
                style={{ fontSize: 14, color: MUTED, marginBottom: 20 }}
              >
                {t("verify.prompt", { email: form.email })}
              </p>
              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="verificationCode"
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: TEXT,
                    marginBottom: 8,
                  }}
                >
                  {t("verify.label")}
                </label>
                <OtpInput id="verificationCode" autoFocus value={code} onChange={setCode} />
              </div>
              {error && (
                <p
                  style={{
                    fontSize: 12,
                    color: "#DC2626",
                    marginBottom: 16,
                    fontWeight: 600,
                  }}
                >
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 9999,
                  border: "none",
                  background: loading ? "#B9B8B2" : TEXT,
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: "pointer",
                  fontFamily: BODY,
                }}
              >
                {loading ? (
                  <>
                    <InlineSpinner size={14} /> {t("verify.submitting")}
                  </>
                ) : (
                  t("verify.submit")
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreateAccount}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <div>
                  <label
                    htmlFor="candFirstName"
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      color: TEXT,
                      marginBottom: 8,
                    }}
                  >
                    {t("form.firstName")}
                  </label>
                  <input
                    id="candFirstName"
                    value={form.firstName}
                    onChange={set("firstName")}
                    placeholder={t("form.firstNamePlaceholder")}
                    required
                    style={fieldInputStyle}
                    onFocus={(e) => {
                      e.target.style.borderColor = TEXT
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "#E6E5E0"
                    }}
                  />
                </div>
                <div>
                  <label
                    htmlFor="candLastName"
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      color: TEXT,
                      marginBottom: 8,
                    }}
                  >
                    {t("form.lastName")}
                  </label>
                  <input
                    id="candLastName"
                    value={form.lastName}
                    onChange={set("lastName")}
                    placeholder={t("form.lastNamePlaceholder")}
                    required
                    style={fieldInputStyle}
                    onFocus={(e) => {
                      e.target.style.borderColor = TEXT
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "#E6E5E0"
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="candDob"
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: TEXT,
                    marginBottom: 8,
                  }}
                >
                  {t("form.dob")}
                </label>
                <input
                  id="candDob"
                  type="date"
                  value={form.dob}
                  onChange={set("dob")}
                  required
                  style={fieldInputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = TEXT
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E6E5E0"
                  }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label
                  htmlFor="candEmail"
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: TEXT,
                    marginBottom: 8,
                  }}
                >
                  {t("form.email")}
                </label>
                <input
                  id="candEmail"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={set("email")}
                  placeholder={t("form.emailPlaceholder")}
                  required
                  style={fieldInputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = TEXT
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E6E5E0"
                  }}
                />
              </div>

              <div style={{ marginBottom: 28 }}>
                <label
                  htmlFor="candPassword"
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: TEXT,
                    marginBottom: 8,
                  }}
                >
                  {t("form.password")}
                </label>
                <input
                  id="candPassword"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={set("password")}
                  placeholder={t("form.passwordPlaceholder")}
                  required
                  minLength={8}
                  style={fieldInputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = TEXT
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E6E5E0"
                  }}
                />
              </div>

              <div
                style={{
                  borderTop: "1px solid #E6E5E0",
                  paddingTop: 20,
                  marginBottom: 8,
                  fontSize: 12,
                  color: MUTED,
                  lineHeight: 1.6,
                }}
              >
                {t("form.docsNote")}
              </div>

              {error && (
                <p
                  style={{
                    fontSize: 12,
                    color: "#DC2626",
                    marginBottom: 16,
                    fontWeight: 600,
                  }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 9999,
                  border: "none",
                  background: loading ? "#B9B8B2" : TEXT,
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: loading ? "not-allowed" : "pointer",
                  fontFamily: BODY,
                }}
              >
                {loading ? (
                  <>
                    <InlineSpinner size={14} /> {t("form.creatingAccount")}
                  </>
                ) : (
                  t("form.continue")
                )}
              </button>

              <p
                style={{
                  fontSize: 11,
                  color: MUTED,
                  textAlign: "center",
                  marginTop: 14,
                  lineHeight: 1.5,
                }}
              >
                {t("form.privacyNote")}
              </p>
            </form>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button
            onClick={() => onNavigate("careers")}
            style={{
              background: "none",
              border: "none",
              color: TEXT,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: BODY,
            }}
          >
            {t("backToCareers")}
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}
