"use client"
import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { startAuthentication } from "@simplewebauthn/browser"
import { Fingerprint } from "lucide-react"
import { palette, inputStyle } from "../theme"
import Spinner, { InlineSpinner } from "../components/Spinner"
import { IconShieldCheck, IconKeyRound } from "../components/NavIcons"
import { axios, authHeader } from "../lib/api"
import PublicNav from "../components/PublicNav"

interface Props {
  onNavigate: (page: string) => void
}

type Method = "totp" | "webauthn"

// Distinct from AdminMfaSetup — that's one-time enrollment; this is the
// per-sign-in re-verification MfaSessionVerifiedGuard requires before an
// enrolled admin can reach any admin-scoped data (docs/BUSINESS_RULES.md).
export default function AdminMfaChallenge({ onNavigate }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminMfaChallenge")
  const [availableMethods, setAvailableMethods] = useState<Method[] | null>(null)
  const [method, setMethod] = useState<Method | null>(null)
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [statusError, setStatusError] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const token = await getToken()
        const { data } = await axios.get("/mfa/status", {
          headers: authHeader(token),
        })
        const methods: Method[] = [
          ...(data.totpEnrolled ? (["totp"] as const) : []),
          ...(data.webauthnCredentials?.length > 0 ? (["webauthn"] as const) : []),
        ]
        setAvailableMethods(methods)
        setMethod(methods[0] ?? null)
      } catch {
        setStatusError(true)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      await axios.post("/mfa/challenge/totp", { code }, {
        headers: authHeader(token),
      })
      onNavigate("admin-dashboard")
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t("errors.invalidCode"))
    } finally {
      setLoading(false)
    }
  }

  const submitWebAuthn = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      const headers = authHeader(token)
      const { data: options } = await axios.post(
        "/mfa/webauthn/auth-options",
        {},
        { headers },
      )
      const response = await startAuthentication({ optionsJSON: options })
      const { data } = await axios.post(
        "/mfa/webauthn/auth-verify",
        { response },
        { headers },
      )
      if (!data.verified) {
        setError(t("errors.webauthnFailed"))
        return
      }
      onNavigate("admin-dashboard")
    } catch {
      setError(t("errors.webauthnFailed"))
    } finally {
      setLoading(false)
    }
  }

  if (statusError || availableMethods?.length === 0) {
    return (
      <div style={{ fontFamily: "Poppins, sans-serif" }}>
        <PublicNav current="admin-mfa-challenge" onNavigate={onNavigate} />
        <div
          style={{
            marginTop: 68,
            minHeight: "calc(100vh - 68px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#F3F2EE",
            padding: 24,
          }}
        >
          <div style={{ fontSize: 13, color: "#DC2626", fontWeight: 600 }}>
            {t("errors.statusLoadFailed")}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: "Poppins, sans-serif" }}>
      <PublicNav current="admin-mfa-challenge" onNavigate={onNavigate} />
      <div
        style={{
          marginTop: 68,
          minHeight: "calc(100vh - 68px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F3F2EE",
          padding: 24,
        }}
      >
      <div
        style={{
          maxWidth: 440,
          width: "100%",
          background: "#fff",
          borderRadius: 24,
          padding: "48px",
          border: "1px solid #E6E5E0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <IconShieldCheck size={22} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: palette.navy }}>
            {t("title")}
          </h1>
        </div>
        <p
          style={{
            fontSize: 14,
            color: palette.muted,
            lineHeight: 1.7,
            marginBottom: 24,
          }}
        >
          {t("subtitle")}
        </p>

        {!availableMethods ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <Spinner size="sm" />
          </div>
        ) : (
          <>
            {availableMethods.length > 1 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 4,
                  padding: 4,
                  background: "#F3F2EE",
                  borderRadius: 12,
                  border: "1px solid #E6E5E0",
                  marginBottom: 24,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMethod("totp")
                    setError(null)
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: method === "totp" ? "#fff" : "transparent",
                    boxShadow: method === "totp" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    color: method === "totp" ? palette.navy : palette.muted,
                    fontWeight: 500,
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "Poppins, sans-serif",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (method !== "totp")
                      (e.currentTarget as HTMLButtonElement).style.color = palette.navy
                  }}
                  onMouseLeave={(e) => {
                    if (method !== "totp")
                      (e.currentTarget as HTMLButtonElement).style.color = palette.muted
                  }}
                >
                  <IconKeyRound size={16} />
                  {t("authenticatorApp")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMethod("webauthn")
                    setError(null)
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: "none",
                    background: method === "webauthn" ? "#fff" : "transparent",
                    boxShadow:
                      method === "webauthn" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    color: method === "webauthn" ? palette.navy : palette.muted,
                    fontWeight: 500,
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "Poppins, sans-serif",
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (method !== "webauthn")
                      (e.currentTarget as HTMLButtonElement).style.color = palette.navy
                  }}
                  onMouseLeave={(e) => {
                    if (method !== "webauthn")
                      (e.currentTarget as HTMLButtonElement).style.color = palette.muted
                  }}
                >
                  <Fingerprint className="size-4" />
                  {t("biometric")}
                </button>
              </div>
            )}

            {method === "totp" && (
              <form onSubmit={submitTotp}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: palette.navy,
                    marginBottom: 7,
                  }}
                >
                  {t("enterCode")}
                </label>
                <input
                  autoFocus
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("codePlaceholder")}
                  required
                  maxLength={6}
                  autoComplete="one-time-code"
                  style={{
                    ...inputStyle,
                    textAlign: "center",
                    fontSize: 20,
                    letterSpacing: "0.5em",
                    fontFamily: "monospace",
                    paddingLeft: 0,
                    paddingRight: 0,
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = palette.accent
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "#E6E5E0"
                  }}
                />
                {error && (
                  <p style={{ fontSize: 13, color: "#DC2626", marginTop: 14 }}>
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%",
                    marginTop: 20,
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
                      <InlineSpinner size={14} /> {t("verifying")}
                    </>
                  ) : (
                    t("verify")
                  )}
                </button>
              </form>
            )}

            {method === "webauthn" && (
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 13, color: palette.muted, marginBottom: 20 }}>
                  {t("webauthnPrompt")}
                </p>
                <button
                  type="button"
                  onClick={submitWebAuthn}
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "13px",
                    borderRadius: 9999,
                    border: "none",
                    background: loading ? "#9CA3AF" : palette.accent,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: "Poppins, sans-serif",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {loading ? (
                    <>
                      <InlineSpinner size={14} /> {t("waiting")}
                    </>
                  ) : (
                    <>
                      <Fingerprint className="size-4" />
                      {t("verifyWithBiometric")}
                    </>
                  )}
                </button>
                {error && (
                  <p style={{ fontSize: 13, color: "#DC2626", marginTop: 14 }}>
                    {error}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  )
}
