"use client" /* Stepper */
import { useEffect, useState } from "react"
import { useSignUp } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette, inputStyle } from "../theme"
import { InlineSpinner } from "../components/Spinner"
import PublicNav from "../components/PublicNav"
const worldImg =
  "https://images.unsplash.com/photo-1602860109208-613d39362844?w=1200&q=85"

interface Props {
  onNavigate: (page: string) => void
  onSignup: () => void
}

const TOTAL_STEPS = 8

export default function ClientSignup({ onNavigate, onSignup }: Props) {
  const { signUp } = useSignUp()
  const t = useTranslations("clientSignup")
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    company: "",
    email: "",
    password: "",
    confirmPassword: "",
  })
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  useEffect(() => {
    if (!success) return
    const timer = setTimeout(() => onSignup(), 3000)
    return () => clearTimeout(timer)
  }, [success, onSignup])

  const passwordChecks = [
    { label: t("passwordChecks.length"), valid: form.password.length >= 8 },
    {
      label: t("passwordChecks.uppercase"),
      valid: /[A-Z]/.test(form.password),
    },
    { label: t("passwordChecks.number"), valid: /[0-9]/.test(form.password) },
    {
      label: t("passwordChecks.symbol"),
      valid: /[^A-Za-z0-9]/.test(form.password),
    },
  ]
  const passwordValid = passwordChecks.every((c) => c.valid)

  const goNext = () => {
    setError(null)
    setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  }
  const goBack = () => {
    setError(null)
    setStep((s) => Math.max(s - 1, 1))
  }

  const handleStepSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (step === 6 && !passwordValid) {
      setError(t("errors.passwordRequirements"))
      return
    }
    if (step === 7) {
      if (form.confirmPassword !== form.password) {
        setError(t("errors.passwordMismatch"))
        return
      }
      setLoading(true)
      setError(null)
      try {
        const { error: createError } = await signUp.password({
          emailAddress: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
          unsafeMetadata: { companyName: form.company, phone: form.phone },
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
        goNext()
      } finally {
        setLoading(false)
      }
      return
    }
    if (step === 8) {
      setLoading(true)
      setError(null)
      try {
        const { error: verifyError } =
          await signUp.verifications.verifyEmailCode({ code })
        if (verifyError) {
          setError(verifyError.message ?? t("errors.invalidCode"))
          return
        }
        const { error: finalizeError } = await signUp.finalize()
        if (finalizeError) {
          setError(finalizeError.message ?? t("errors.finalizeFailed"))
          return
        }
        setSuccess(true)
      } finally {
        setLoading(false)
      }
      return
    }

    goNext()
  }

  if (success) {
    return (
      <div style={{ fontFamily: "Poppins, sans-serif" }}>
        <PublicNav current="client-signup" onNavigate={onNavigate} />
        <div
          style={{
            marginTop: 68,
            minHeight: "calc(100vh - 68px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#F8FAFC",
            padding: 24,
          }}
        >
        <div
          className="step-slide"
          style={{
            maxWidth: 480,
            width: "100%",
            background: "#fff",
            borderRadius: 24,
            padding: "64px 48px",
            border: "1px solid #E2E8F0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "#F0FDF4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 36,
              margin: "0 auto 24px",
              color: "#16A34A",
            }}
          >
            ✓
          </div>
          <h2
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: palette.navy,
              marginBottom: 12,
              letterSpacing: "-0.02em",
            }}
          >
            {t("success.title")}
          </h2>
          <p style={{ fontSize: 14, color: palette.muted, lineHeight: 1.8 }}>
            {t.rich("success.body", {
              firstName: form.firstName,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </div>
        </div>
      </div>
    )
  }

  const stepTitle = t(`stepTitles.${step}` as any)

  return (
    <div style={{ fontFamily: "Poppins, sans-serif" }}>
      {/* Clerk manages this element itself (sizes/renders the CAPTCHA
          widget into it when a challenge is required) — without it present
          in the DOM before signUp.password() is called, Clerk silently
          falls back to a weaker invisible-only check instead of erroring,
          so it's easy to miss. See Clerk's custom-flow bot-protection docs. */}
      <div id="clerk-captcha" />
      <PublicNav current="client-signup" onNavigate={onNavigate} />
      <div
        className="signup-split"
        style={{
          marginTop: 68,
          minHeight: "calc(100vh - 68px)",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
        }}
      >
      <div
        className="signup-split-panel"
        style={{ position: "relative", overflow: "hidden", background: "#111" }}
      >
        <img
          src={worldImg}
          alt="Industrial energy infrastructure"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.75,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(135deg, ${palette.accent}bb 0%, rgba(15,23,42,0.85) 100%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: 52,
          }}
        >
          <h2
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: "#fff",
              lineHeight: 1.15,
              marginBottom: 20,
              letterSpacing: "-0.02em",
            }}
          >
            {t("panel.heading")}
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "rgba(255,255,255,0.8)",
              lineHeight: 1.7,
              marginBottom: 40,
            }}
          >
            {t("panel.body")}
          </p>
          {[t("panel.perk1"), t("panel.perk2"), t("panel.perk3")].map(
            (perk) => (
              <div
                key={perk}
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.9)",
                  fontWeight: 500,
                  marginBottom: 12,
                }}
              >
                {perk}
              </div>
            ),
          )}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "60px 48px",
          background: "#fff",
          overflowY: "auto",
        }}
      >
        <div style={{ maxWidth: 420, width: "100%", margin: "0 auto" }}>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: palette.navy,
              marginBottom: 4,
              letterSpacing: "-0.02em",
            }}
          >
            {t("title")}
          </h1>
          <p style={{ fontSize: 13, color: palette.muted, marginBottom: 24 }}>
            {t("stepOf", { step, total: TOTAL_STEPS, label: stepTitle })}
          </p>

          {}
          <div
            style={{ display: "flex", alignItems: "center", marginBottom: 32 }}
          >
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(
              (s, i) => {
                const done = s < step
                const current = s === step
                return (
                  <div
                    key={s}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flex: i < TOTAL_STEPS - 1 ? 1 : "none",
                    }}
                  >
                    <div
                      className={done ? "step-circle-done" : undefined}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        background: done
                          ? "#16A34A"
                          : current
                            ? palette.accent
                            : "#E2E8F0",
                        color: done || current ? "#fff" : "#94A3B8",
                        transition: "background 0.3s",
                      }}
                    >
                      {done ? "✓" : s}
                    </div>
                    {i < TOTAL_STEPS - 1 && (
                      <div
                        style={{
                          flex: 1,
                          height: 3,
                          background: "#E2E8F0",
                          margin: "0 4px",
                          borderRadius: 9999,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          className={done ? "step-bar-fill" : undefined}
                          style={{
                            height: "100%",
                            width: done ? "100%" : "0%",
                            background: "#16A34A",
                            borderRadius: 9999,
                            transition: "width 0.3s",
                          }}
                        />
                      </div>
                    )}
                  </div>
                )
              },
            )}
          </div>

          <form key={step} onSubmit={handleStepSubmit} className="step-slide">
            {step === 1 && (
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette.navy,
                    marginBottom: 7,
                  }}
                >
                  {t("form.firstName")}
                </label>
                <input
                  autoFocus
                  name="firstName"
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={set("firstName")}
                  placeholder={t("form.firstNamePlaceholder")}
                  required
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = palette.accent
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E2E8F0"
                  }}
                />
              </div>
            )}
            {step === 2 && (
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette.navy,
                    marginBottom: 7,
                  }}
                >
                  {t("form.lastName")}
                </label>
                <input
                  autoFocus
                  name="lastName"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={set("lastName")}
                  placeholder={t("form.lastNamePlaceholder")}
                  required
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = palette.accent
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E2E8F0"
                  }}
                />
              </div>
            )}
            {step === 3 && (
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette.navy,
                    marginBottom: 7,
                  }}
                >
                  {t("form.phone")}
                </label>
                <input
                  autoFocus
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={set("phone")}
                  placeholder={t("form.phonePlaceholder")}
                  required
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = palette.accent
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E2E8F0"
                  }}
                />
              </div>
            )}
            {step === 4 && (
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette.navy,
                    marginBottom: 7,
                  }}
                >
                  {t("form.company")}
                </label>
                <input
                  autoFocus
                  name="company"
                  autoComplete="organization"
                  value={form.company}
                  onChange={set("company")}
                  placeholder={t("form.companyPlaceholder")}
                  required
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = palette.accent
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E2E8F0"
                  }}
                />
              </div>
            )}
            {step === 5 && (
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette.navy,
                    marginBottom: 7,
                  }}
                >
                  {t("form.email")}
                </label>
                <input
                  autoFocus
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={set("email")}
                  placeholder={t("form.emailPlaceholder")}
                  required
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = palette.accent
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E2E8F0"
                  }}
                />
              </div>
            )}
            {step === 6 && (
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette.navy,
                    marginBottom: 7,
                  }}
                >
                  {t("form.password")}
                </label>
                <input
                  autoFocus
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={set("password")}
                  placeholder={t("form.passwordPlaceholder")}
                  required
                  minLength={8}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = palette.accent
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E2E8F0"
                  }}
                />
                <ul style={{ listStyle: "none", padding: 0, marginTop: 14 }}>
                  {passwordChecks.map((rule) => (
                    <li
                      key={rule.label}
                      style={{
                        color: rule.valid ? "#16A34A" : "#94A3B8",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 6,
                        fontSize: 12.5,
                        fontWeight: 500,
                      }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: rule.valid ? "#16A34A" : "#CBD5E1",
                          flexShrink: 0,
                        }}
                      />
                      {rule.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {step === 7 && (
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette.navy,
                    marginBottom: 7,
                  }}
                >
                  {t("form.confirmPassword")}
                </label>
                <input
                  autoFocus
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={set("confirmPassword")}
                  placeholder={t("form.confirmPasswordPlaceholder")}
                  required
                  minLength={8}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = palette.accent
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E2E8F0"
                  }}
                />
              </div>
            )}
            {step === 8 && (
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette.navy,
                    marginBottom: 7,
                  }}
                >
                  {t("form.verificationCode")}
                </label>
                <p
                  style={{
                    fontSize: 12.5,
                    color: palette.muted,
                    marginBottom: 10,
                  }}
                >
                  {t("form.codePrompt", { email: form.email })}
                </p>
                <input
                  autoFocus
                  name="code"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t("form.codePlaceholder")}
                  required
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = palette.accent
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E2E8F0"
                  }}
                />
              </div>
            )}

            {error && (
              <p style={{ fontSize: 13, color: "#DC2626", marginBottom: 16 }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              {step > 1 && (
                <button
                  type="button"
                  onClick={goBack}
                  disabled={loading}
                  style={{
                    flex: "0 0 auto",
                    padding: "13px 22px",
                    borderRadius: 9999,
                    border: "1.5px solid #E2E8F0",
                    background: "#fff",
                    color: palette.navy,
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "Poppins, sans-serif",
                  }}
                >
                  {t("back")}
                </button>
              )}
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "13px",
                  borderRadius: 9999,
                  border: "none",
                  background: loading ? "#9CA3AF" : palette.accent,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "Poppins, sans-serif",
                }}
              >
                {loading ? (
                  <>
                    <InlineSpinner size={14} /> {t("pleaseWait")}
                  </>
                ) : step === 8 ? (
                  t("verifyAndCreate")
                ) : (
                  t("next")
                )}
              </button>
            </div>
          </form>

          <div style={{ textAlign: "center", marginTop: 24 }}>
            <span style={{ fontSize: 13, color: palette.muted }}>
              {t("alreadyHaveAccount")}{" "}
            </span>
            <button
              onClick={() => onNavigate("client-login")}
              style={{
                background: "none",
                border: "none",
                color: palette.accent,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
              }}
            >
              {t("signIn")}
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
