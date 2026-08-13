"use client"
import { useState, useRef } from "react"
import { useSignUp, useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette, inputStyle } from "../theme"
import { InlineSpinner } from "../components/Spinner"
import { axios, authHeader } from "../lib/api"

interface Props {
  onNavigate: (page: string) => void
  positionId?: string | null
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
  const [idFile, setIdFile] = useState<File | null>(null)
  const [cvFile, setCvFile] = useState<File | null>(null)
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"form" | "verify">("form")
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef<HTMLInputElement>(null)
  const cvRef = useRef<HTMLInputElement>(null)

  const set =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  const uploadFile = async (
    file: File,
    kind: "candidate-id-photo" | "candidate-cv",
    token: string | null,
  ) => {
    const { data } = await axios.post(
      "/uploads/presign",
      { kind, contentType: file.type },
      { headers: authHeader(token) },
    )
    await fetch(data.url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    })
    return data.key as string
  }

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!idFile || !cvFile) return
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
    if (!idFile || !cvFile) return
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
      const [idPhotoS3Key, cvS3Key] = await Promise.all([
        uploadFile(idFile, "candidate-id-photo", token),
        uploadFile(cvFile, "candidate-cv", token),
      ])
      await axios.post(
        "/me/become-candidate",
        {
          dateOfBirth: form.dob,
          idPhotoS3Key,
          cvS3Key,
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

  const UploadBox = ({
    label,
    file,
    accept,
    onRef,
    onFile,
  }: {
    label: string
    file: File | null
    accept: string
    onRef: React.RefObject<HTMLInputElement | null>
    onFile: (f: File) => void
  }) => (
    <div
      onClick={() => onRef.current?.click()}
      style={{
        border: `2px dashed ${file ? palette.accent : "#E2E8F0"}`,
        borderRadius: 14,
        padding: "24px",
        cursor: "pointer",
        textAlign: "center",
        background: file ? "#FFF7ED" : "#F8FAFC",
        transition: "border-color 0.2s, background 0.2s",
      }}
      onMouseEnter={(e) => {
        if (!file)
          (e.currentTarget as HTMLDivElement).style.borderColor = "#94A3B8"
      }}
      onMouseLeave={(e) => {
        if (!file)
          (e.currentTarget as HTMLDivElement).style.borderColor = "#E2E8F0"
      }}
    >
      <input
        ref={onRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0])
        }}
      />
      <div style={{ fontSize: 28, marginBottom: 8 }}>
        {file ? "✅" : accept.includes("image") ? "🪪" : "📄"}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: file ? palette.accent : palette.navy,
          marginBottom: 4,
        }}
      >
        {file ? file.name : label}
      </div>
      <div style={{ fontSize: 11, color: palette.muted }}>
        {file
          ? t("form.clickToReplace")
          : accept.includes("image")
            ? t("form.imageHint")
            : t("form.docHint")}
      </div>
    </div>
  )

  if (submitted) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F8FAFC",
          fontFamily: "Poppins, sans-serif",
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
            border: "1px solid #E2E8F0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: "#FFF7ED",
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
              fontSize: 26,
              fontWeight: 800,
              color: palette.navy,
              marginBottom: 12,
              letterSpacing: "-0.02em",
            }}
          >
            {t("submitted.title")}
          </h2>
          <p
            style={{
              fontSize: 14,
              color: palette.muted,
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
              background: "#F8FAFC",
              borderRadius: 14,
              padding: "20px 24px",
              marginBottom: 32,
              textAlign: "left",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: palette.accent,
                fontWeight: 700,
                letterSpacing: "0.12em",
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
                    background: palette.accent,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
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
                    color: palette.slate,
                    lineHeight: 1.5,
                  }}
                >
                  {s}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => onNavigate("home")}
            style={{
              background: palette.accent,
              color: "#fff",
              border: "none",
              borderRadius: 9999,
              padding: "12px 32px",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            {t("returnHome")}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F8FAFC",
        fontFamily: "Poppins, sans-serif",
        padding: "40px 24px",
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <button
          onClick={() => onNavigate("home")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 36,
          }}
        >
          <img
            src="/images/logo-nav-future-energy.png"
            alt="United Services Egypt"
            style={{ height: 32, width: "auto", objectFit: "contain" }}
          />
        </button>

        <div
          style={{
            background: "#fff",
            borderRadius: 24,
            padding: "48px",
            border: "1px solid #E2E8F0",
          }}
        >
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: palette.navy,
              marginBottom: 8,
              letterSpacing: "-0.02em",
            }}
          >
            {t("title")}
          </h1>
          <p
            style={{
              fontSize: 14,
              color: palette.muted,
              marginBottom: 36,
              lineHeight: 1.6,
            }}
          >
            {t("subtitle")}
          </p>

          {step === "verify" ? (
            <form onSubmit={handleVerify}>
              <p
                style={{ fontSize: 14, color: palette.muted, marginBottom: 20 }}
              >
                {t("verify.prompt", { email: form.email })}
              </p>
              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette.navy,
                    marginBottom: 8,
                  }}
                >
                  {t("verify.label")}
                </label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t("verify.placeholder")}
                  required
                  autoComplete="one-time-code"
                  style={inputStyle}
                  onFocus={(e) => {
                    e.target.style.borderColor = palette.accent
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E2E8F0"
                  }}
                />
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
                  background: loading ? "#9CA3AF" : palette.accent,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                  fontFamily: "Poppins, sans-serif",
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
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      color: palette.navy,
                      marginBottom: 8,
                    }}
                  >
                    {t("form.firstName")}
                  </label>
                  <input
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
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 600,
                      color: palette.navy,
                      marginBottom: 8,
                    }}
                  >
                    {t("form.lastName")}
                  </label>
                  <input
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
              </div>

              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette.navy,
                    marginBottom: 8,
                  }}
                >
                  {t("form.dob")}
                </label>
                <input
                  type="date"
                  value={form.dob}
                  onChange={set("dob")}
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

              <div style={{ marginBottom: 16 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette.navy,
                    marginBottom: 8,
                  }}
                >
                  {t("form.email")}
                </label>
                <input
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

              <div style={{ marginBottom: 28 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette.navy,
                    marginBottom: 8,
                  }}
                >
                  {t("form.password")}
                </label>
                <input
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
              </div>

              <div
                style={{
                  borderTop: "1px solid #F1F5F9",
                  paddingTop: 28,
                  marginBottom: 28,
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: palette.navy,
                    marginBottom: 6,
                  }}
                >
                  {t("form.docsHeading")}
                </div>
                <p
                  style={{
                    fontSize: 13,
                    color: palette.muted,
                    marginBottom: 20,
                  }}
                >
                  {t("form.docsBody")}
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: palette.navy,
                        marginBottom: 8,
                      }}
                    >
                      {t("form.idLabel")}
                    </div>
                    <UploadBox
                      label={t("form.uploadId")}
                      file={idFile}
                      accept="image/*"
                      onRef={idRef}
                      onFile={(f) => setIdFile(f)}
                    />
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: palette.navy,
                        marginBottom: 8,
                      }}
                    >
                      {t("form.cvLabel")}
                    </div>
                    <UploadBox
                      label={t("form.uploadCv")}
                      file={cvFile}
                      accept=".pdf,.doc,.docx"
                      onRef={cvRef}
                      onFile={(f) => setCvFile(f)}
                    />
                  </div>
                </div>
              </div>

              {(!idFile || !cvFile) && (
                <p
                  style={{
                    fontSize: 12,
                    color: "#F59E0B",
                    marginBottom: 16,
                    fontWeight: 600,
                  }}
                >
                  {t("form.missingUploads")}
                </p>
              )}

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
                disabled={loading || !idFile || !cvFile}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 9999,
                  border: "none",
                  background:
                    loading || !idFile || !cvFile ? "#9CA3AF" : palette.accent,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 15,
                  cursor:
                    loading || !idFile || !cvFile ? "not-allowed" : "pointer",
                  fontFamily: "Poppins, sans-serif",
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
                  color: "#94A3B8",
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
              color: palette.accent,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            {t("backToCareers")}
          </button>
        </div>
      </div>
    </div>
  )
}
