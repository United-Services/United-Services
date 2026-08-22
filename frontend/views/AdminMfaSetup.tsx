"use client"
import { useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { startRegistration } from "@simplewebauthn/browser"
import { Fingerprint } from "lucide-react"
import { palette } from "../theme"
import Spinner, { InlineSpinner } from "../components/Spinner"
import { Skeleton } from "../components/Skeleton"
import OtpInput from "../components/OtpInput"
import {
  IconShieldCheck,
  IconKeyRound,
  IconCopy,
  IconCheck,
} from "../components/NavIcons"
import { axios, authHeader } from "../lib/api"
import PublicNav from "../components/PublicNav"

interface Props {
  onNavigate: (page: string) => void
}

export default function AdminMfaSetup({ onNavigate }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminMfaSetup")
  const [method, setMethod] = useState<"choose" | "totp" | "webauthn">("choose")
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const startTotp = async () => {
    setLoading(true)
    setError(null)
    setMethod("totp")
    try {
      const token = await getToken()
      const { data } = await axios.post("/mfa/totp/enroll", {}, {
        headers: authHeader(token),
      })
      setQrCodeDataUrl(data.qrCodeDataUrl)
      setSecret(data.secret)
    } catch {
      setError(t("errors.totpStartFailed"))
    } finally {
      setLoading(false)
    }
  }

  const confirmTotp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      await axios.post("/mfa/totp/confirm", { code }, {
        headers: authHeader(token),
      })
      setDone(true)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t("errors.invalidCode"))
    } finally {
      setLoading(false)
    }
  }

  const startWebAuthn = async () => {
    setLoading(true)
    setError(null)
    setMethod("webauthn")
    try {
      const token = await getToken()
      const { data: options } = await axios.post(
        "/mfa/webauthn/register-options",
        {},
        { headers: authHeader(token) },
      )
      const response = await startRegistration({ optionsJSON: options })
      await axios.post(
        "/mfa/webauthn/register-verify",
        { response, label: "Biometric credential" },
        { headers: authHeader(token) },
      )
      setDone(true)
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t("errors.webauthnFailed"))
      setMethod("choose")
    } finally {
      setLoading(false)
    }
  }

  const copySecret = async () => {
    if (!secret) return
    await navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (done) {
    return (
      <div style={{ fontFamily: "Poppins, sans-serif" }}>
        <PublicNav current="admin-mfa-setup" onNavigate={onNavigate} />
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
            maxWidth: 480,
            width: "100%",
            background: "#fff",
            borderRadius: 24,
            padding: "56px 48px",
            border: "1px solid #E6E5E0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "#F0FDF4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              margin: "0 auto 20px",
              color: "#16A34A",
            }}
          >
            ✓
          </div>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: palette.navy,
              marginBottom: 10,
            }}
          >
            {t("doneTitle")}
          </h2>
          <p
            style={{
              fontSize: 14,
              color: palette.muted,
              lineHeight: 1.7,
              marginBottom: 28,
            }}
          >
            {t("doneBody")}
          </p>
          <button
            onClick={() => onNavigate("admin-dashboard")}
            style={{
              background: palette.accent,
              color: palette.navy,
              border: "none",
              borderRadius: 9999,
              padding: "12px 32px",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            {t("continueToDashboard")}
          </button>
        </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: "Poppins, sans-serif" }}>
      <PublicNav current="admin-mfa-setup" onNavigate={onNavigate} />
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
          maxWidth: 480,
          width: "100%",
          background: "#fff",
          borderRadius: 24,
          padding: "48px",
          border: "1px solid #E6E5E0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <IconShieldCheck size={22} />
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: palette.navy,
            }}
          >
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

        {}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 4,
            padding: 4,
            background: "#F3F2EE",
            borderRadius: 12,
            border: "1px solid #E6E5E0",
            marginBottom: method === "choose" ? 0 : 24,
          }}
        >
          <button
            type="button"
            onClick={startTotp}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: method !== "webauthn" ? "#fff" : "transparent",
              boxShadow: method !== "webauthn" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              color: method !== "webauthn" ? palette.navy : palette.muted,
              fontWeight: 500,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (method === "webauthn")
                (e.currentTarget as HTMLButtonElement).style.color = palette.navy
            }}
            onMouseLeave={(e) => {
              if (method === "webauthn")
                (e.currentTarget as HTMLButtonElement).style.color = palette.muted
            }}
          >
            <IconKeyRound size={16} />
            {t("authenticatorApp")}
          </button>
          <button
            type="button"
            onClick={startWebAuthn}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              background: method === "webauthn" ? "#fff" : "transparent",
              boxShadow: method === "webauthn" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
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

        {method === "choose" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
            <p style={{ fontSize: 12.5, color: palette.muted, lineHeight: 1.6 }}>
              {t("authenticatorAppDesc")}
            </p>
            <p style={{ fontSize: 12.5, color: palette.muted, lineHeight: 1.6 }}>
              {t("biometricDesc")}
            </p>
          </div>
        )}

        {method === "totp" && (
          <form onSubmit={confirmTotp}>
            {loading && !qrCodeDataUrl ? (
              <div style={{ textAlign: "center", padding: "20px 0" }}>
                <Skeleton height={180} width={180} radius={12} style={{ margin: "0 auto 16px" }} />
                <Skeleton height={13} width={140} style={{ margin: "0 auto" }} />
              </div>
            ) : (
              qrCodeDataUrl && (
                <>
                  <div style={{ textAlign: "center", marginBottom: 20 }}>
                    <img
                      src={qrCodeDataUrl}
                      alt="TOTP QR code"
                      style={{
                        width: 180,
                        height: 180,
                        margin: "0 auto",
                        border: "1px solid #E6E5E0",
                        borderRadius: 12,
                      }}
                    />
                  </div>
                  {secret && (
                    <>
                      <div
                        style={{
                          fontSize: 12,
                          color: palette.muted,
                          marginBottom: 6,
                        }}
                      >
                        {t("cantScan")}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid #E6E5E0",
                          background: "#F3F2EE",
                          marginBottom: 20,
                        }}
                      >
                        <code
                          style={{
                            fontFamily: "monospace",
                            fontSize: 13,
                            color: palette.navy,
                            wordBreak: "break-all",
                          }}
                        >
                          {secret}
                        </code>
                        <button
                          type="button"
                          onClick={copySecret}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            flexShrink: 0,
                            padding: "5px 9px",
                            borderRadius: 8,
                            border: "none",
                            background: "none",
                            color: palette.muted,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "Poppins, sans-serif",
                          }}
                        >
                          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
                          {copied ? t("copied") : t("copy")}
                        </button>
                      </div>
                    </>
                  )}
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
                  <OtpInput autoFocus value={code} onChange={setCode} />
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
                      color: loading ? "#fff" : palette.navy,
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
                      t("verifyAndEnable")
                    )}
                  </button>
                </>
              )
            )}
            {error && !qrCodeDataUrl && (
              <p style={{ fontSize: 13, color: "#DC2626", marginTop: 14 }}>{error}</p>
            )}
            <button
              type="button"
              onClick={() => {
                setMethod("choose")
                setQrCodeDataUrl(null)
                setSecret(null)
                setError(null)
              }}
              style={{
                width: "100%",
                marginTop: 10,
                padding: "10px",
                borderRadius: 9999,
                border: "none",
                background: "none",
                color: palette.muted,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
              }}
            >
              {t("back")}
            </button>
          </form>
        )}

        {method === "webauthn" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <Spinner
              size="sm"
              message={loading ? t("followPrompt") : t("waiting")}
            />
            {error && (
              <p style={{ fontSize: 13, color: "#DC2626", marginTop: 14 }}>
                {error}
              </p>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
