"use client"

// Admin-only MFA management: re-verify, then add another authenticator or
// replace a password. Password reset here never uses an email link — it
// requires a fresh MFA proof in the same request. See
// docs/BUSINESS_RULES.md rule 7.
 
/* Authenticator app */ /* WebAuthn credentials */ /* Password reset — MFA-gated, not email-link based */

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { startAuthentication, startRegistration } from "@simplewebauthn/browser"
import { palette, inputStyle } from "../theme"
import { SkeletonPanel } from "../components/Skeleton"
import { InlineSpinner } from "../components/Spinner"
import OtpInput from "../components/OtpInput"
import { isAxiosError } from "axios"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { useRequestGuard } from "../lib/useRequestGuard"

interface WebAuthnCredentialSummary {
  id: string
  label: string | null
  deviceType: string
  createdAt: string
}

interface MfaStatus {
  mfaEnrolled: boolean
  totpEnrolled: boolean
  webauthnCredentials: WebAuthnCredentialSummary[]
}

// Both addWebAuthn() and resetPassword()'s webauthn branch call into
// @simplewebauthn/browser's startRegistration()/startAuthentication(),
// which already wraps the raw DOMException a browser/authenticator
// throws (cancelled, timed out, "already registered", etc.) into a
// WebAuthnError with a specific, genuinely useful .message — e.g. "The
// authenticator was previously registered" is exactly what actually
// happens when re-registering the same device as a second credential.
// Previously this was discarded entirely (a bare `catch {}` with no
// error binding at all), always showing one generic message regardless
// of cause, and never logging anything — nothing to diagnose from, by
// design, not by accident. console.error here ships to Betterstack (see
// instrumentation-client.ts), so a real failure is now traceable.
function webauthnOrApiErrorMessage(err: unknown, fallback: string): string {
  console.error("[AdminSecuritySection] WebAuthn/API call failed:", err)
  // @simplewebauthn/browser throws this exact message when
  // window.PublicKeyCredential is unavailable, which happens on any
  // insecure context (plain http:// on a non-localhost origin, e.g. a
  // LAN IP) — the browser itself hides the WebAuthn API there, nothing
  // the app can work around. The stock message reads like a browser
  // compatibility problem, so replace it with the actual cause.
  if (err instanceof Error && err.message === "WebAuthn is not supported in this browser") {
    return "Biometric sign-in requires a secure connection (HTTPS). This page was loaded over plain HTTP, so your browser has disabled it — use the authenticator code method instead, or access this site over HTTPS."
  }
  if (isAxiosError(err)) return getErrorMessage(err, fallback)
  if (err instanceof Error && err.message) return err.message
  return fallback
}

export default function AdminSecuritySection() {
  const { getToken } = useAuth()
  const t = useTranslations("adminSecurity")
  const [status, setStatus] = useState<MfaStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{
    type: "ok" | "error"
    text: string
  } | null>(null)

  const [totpQr, setTotpQr] = useState<string | null>(null)
  const [totpSecret, setTotpSecret] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState("")

  const [resetMethod, setResetMethod] = useState<"totp" | "webauthn">("totp")
  const [resetTotpCode, setResetTotpCode] = useState("")
  const [newPassword, setNewPassword] = useState("")

  const statusGuard = useRequestGuard()
  const loadStatus = async () => {
    // Re-invoked after addTotp/confirmTotp (see below) on top of the
    // mount-time call below — the guard stops a slow initial fetch from
    // landing after and overwriting the post-enrollment status with stale
    // pre-enrollment data.
    const reqId = statusGuard.start()
    try {
      const token = await getToken()
      const { data } = await axios.get("/mfa/status", {
        headers: authHeader(token),
      })
      if (statusGuard.stale(reqId)) return
      setStatus(data)
    } catch (err) {
      if (statusGuard.stale(reqId)) return
      setMessage({
        type: "error",
        text: getErrorMessage(err, t("messages.statusLoadFailed")),
      })
    }
  }

  useEffect(() => {
    // Standard fetch-on-mount (react.dev/learn/you-might-not-need-an-effect
    // explicitly endorses this shape) — loadStatus only touches state after
    // its own await, so nothing here sets state synchronously during this
    // effect's own execution.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStatus()
  }, [])

  const addTotp = async () => {
    setBusy("totp-start")
    setMessage(null)
    try {
      const token = await getToken()
      const { data } = await axios.post("/mfa/totp/enroll", {}, {
        headers: authHeader(token),
      })
      setTotpQr(data.qrCodeDataUrl)
      setTotpSecret(data.secret)
    } catch {
      setMessage({ type: "error", text: t("messages.totpStartFailed") })
    } finally {
      setBusy(null)
    }
  }

  const confirmTotp = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy("totp-confirm")
    setMessage(null)
    try {
      const token = await getToken()
      await axios.post("/mfa/totp/confirm", { code: totpCode }, {
        headers: authHeader(token),
      })
      setTotpQr(null)
      setTotpSecret(null)
      setTotpCode("")
      setMessage({ type: "ok", text: t("messages.authenticatorUpdated") })
      await loadStatus()
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err?.response?.data?.message ?? t("messages.invalidCode"),
      })
    } finally {
      setBusy(null)
    }
  }

  const addWebAuthn = async () => {
    setBusy("webauthn")
    setMessage(null)
    try {
      const token = await getToken()
      const { data: options } = await axios.post(
        "/mfa/webauthn/register-options",
        {},
        { headers: authHeader(token) },
      )
      const response = await startRegistration({ optionsJSON: options })
      const label = window.prompt(t("credentialLabelPrompt")) ?? undefined
      await axios.post("/mfa/webauthn/register-verify", { response, label }, {
        headers: authHeader(token),
      })
      setMessage({ type: "ok", text: t("messages.credentialRegistered") })
      await loadStatus()
    } catch (err) {
      setMessage({
        type: "error",
        text: webauthnOrApiErrorMessage(err, t("messages.credentialFailed")),
      })
    } finally {
      setBusy(null)
    }
  }

  // Self-service delete of one of the admin's own credentials — the
  // backend rejects this if it would leave the account with zero working
  // MFA methods (see mfa.service.ts's deleteWebauthnCredential), so
  // "replace" is just enroll-a-new-one-then-delete-the-old from here.
  const deleteWebAuthn = async (credentialId: string) => {
    if (!window.confirm(t("confirmDeleteCredential"))) return
    setBusy(`delete-${credentialId}`)
    setMessage(null)
    try {
      const token = await getToken()
      await axios.delete(`/mfa/webauthn/${credentialId}`, {
        headers: authHeader(token),
      })
      setMessage({ type: "ok", text: t("messages.credentialDeleted") })
      await loadStatus()
    } catch (err) {
      setMessage({
        type: "error",
        text: webauthnOrApiErrorMessage(err, t("messages.credentialDeleteFailed")),
      })
    } finally {
      setBusy(null)
    }
  }

  // Self-service delete of the authenticator app enrollment — same
  // never-strand-the-account guard as deleteWebAuthn (see
  // mfa.service.ts's deleteTotpCredential).
  const deleteTotp = async () => {
    if (!window.confirm(t("confirmDeleteAuthenticator"))) return
    setBusy("totp-delete")
    setMessage(null)
    try {
      const token = await getToken()
      await axios.delete("/mfa/totp", { headers: authHeader(token) })
      setMessage({ type: "ok", text: t("messages.authenticatorDeleted") })
      await loadStatus()
    } catch (err) {
      setMessage({
        type: "error",
        text: webauthnOrApiErrorMessage(err, t("messages.authenticatorDeleteFailed")),
      })
    } finally {
      setBusy(null)
    }
  }

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy("reset")
    setMessage(null)
    try {
      const token = await getToken()
      if (resetMethod === "totp") {
        await axios.post(
          "/mfa/admin-password-reset",
          { method: "totp", totpCode: resetTotpCode, newPassword },
          { headers: authHeader(token) },
        )
      } else {
        const { data: options } = await axios.post(
          "/mfa/webauthn/auth-options",
          {},
          { headers: authHeader(token) },
        )
        const response = await startAuthentication({ optionsJSON: options })
        await axios.post(
          "/mfa/admin-password-reset",
          { method: "webauthn", webauthnResponse: response, newPassword },
          { headers: authHeader(token) },
        )
      }
      setNewPassword("")
      setResetTotpCode("")
      setMessage({ type: "ok", text: t("messages.passwordUpdated") })
    } catch (err) {
      setMessage({
        type: "error",
        text: webauthnOrApiErrorMessage(err, t("messages.passwordResetFailed")),
      })
    } finally {
      setBusy(null)
    }
  }

  if (!status) {
    // Previously: an infinite spinner if loadStatus failed — status never
    // becomes non-null, so this early return kept firing forever with no
    // way for the admin to see the error or retry.
    if (message?.type === "error") {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 12,
            maxWidth: 640,
            margin: "0 auto",
          }}
        >
          <div style={{ fontSize: 13, color: "#DC2626", fontWeight: 600 }}>
            {message.text}
          </div>
          <button
            onClick={loadStatus}
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
            {t("retry")}
          </button>
        </div>
      )
    }
    return <SkeletonPanel lines={3} />
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      {message && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            background: message.type === "ok" ? "#F0FDF4" : "#FEF2F2",
            color: message.type === "ok" ? "#16A34A" : "#DC2626",
            border: `1px solid ${
              message.type === "ok" ? "#BBF7D0" : "#FECACA"
            }`,
          }}
        >
          {message.text}
        </div>
      )}

      {}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E6E5E0",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: palette.navy,
            marginBottom: 4,
          }}
        >
          {t("authenticatorApp")}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            fontSize: 13,
            color: palette.muted,
            marginBottom: 16,
          }}
        >
          <span>
            {t("status")}{" "}
            <strong
              style={{ color: status.totpEnrolled ? "#16A34A" : palette.muted }}
            >
              {status.totpEnrolled ? t("enabled") : t("notEnrolled")}
            </strong>
          </span>
          {status.totpEnrolled && (
            <button
              type="button"
              onClick={deleteTotp}
              disabled={busy === "totp-delete"}
              style={{
                border: "none",
                background: "none",
                color: "#DC2626",
                fontWeight: 600,
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
                padding: "4px 8px",
                flexShrink: 0,
              }}
            >
              {busy === "totp-delete" ? (
                <InlineSpinner size={12} />
              ) : (
                t("deleteAuthenticator")
              )}
            </button>
          )}
        </div>

        {totpQr ? (
          <form onSubmit={confirmTotp}>
            <img
              src={totpQr}
              alt="TOTP QR code"
              style={{
                width: 160,
                height: 160,
                border: "1px solid #E6E5E0",
                borderRadius: 12,
                marginBottom: 10,
              }}
            />
            {totpSecret && (
              <p
                style={{
                  fontSize: 11,
                  color: palette.muted,
                  marginBottom: 12,
                  wordBreak: "break-all",
                }}
              >
                {t("manualEntry")} <strong>{totpSecret}</strong>
              </p>
            )}
            <OtpInput value={totpCode} onChange={setTotpCode} />
            <button
              type="submit"
              disabled={busy === "totp-confirm"}
              style={{
                marginTop: 12,
                padding: "10px 20px",
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
              {t("verifyAndSave")}
            </button>
          </form>
        ) : (
          <button
            onClick={addTotp}
            disabled={busy === "totp-start"}
            style={{
              padding: "10px 20px",
              borderRadius: 9999,
              border: "1.5px solid #E6E5E0",
              background: "#fff",
              color: palette.navy,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            {status.totpEnrolled
              ? t("replaceAuthenticator")
              : t("setUpAuthenticator")}
          </button>
        )}
      </div>

      {}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E6E5E0",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: palette.navy,
            marginBottom: 4,
          }}
        >
          {t("biometricCredentials")}
        </div>
        <div style={{ fontSize: 13, color: palette.muted, marginBottom: 16 }}>
          {status.webauthnCredentials.length === 0
            ? t("noneRegistered")
            : t("registeredCount", {
                count: status.webauthnCredentials.length,
              })}
        </div>
        {status.webauthnCredentials.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, marginBottom: 16 }}>
            {status.webauthnCredentials.map((c) => (
              <li
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  fontSize: 13,
                  color: palette.slate,
                  padding: "8px 0",
                  borderTop: "1px solid #F3F2EE",
                }}
              >
                <span>
                  {c.label || c.deviceType} —{" "}
                  {t("addedOn", {
                    date: new Date(c.createdAt).toLocaleDateString(),
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => deleteWebAuthn(c.id)}
                  disabled={busy === `delete-${c.id}`}
                  style={{
                    border: "none",
                    background: "none",
                    color: "#DC2626",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "Poppins, sans-serif",
                    padding: "4px 8px",
                    flexShrink: 0,
                  }}
                >
                  {busy === `delete-${c.id}` ? (
                    <InlineSpinner size={12} />
                  ) : (
                    t("deleteCredential")
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={addWebAuthn}
          disabled={busy === "webauthn"}
          style={{
            padding: "10px 20px",
            borderRadius: 9999,
            border: "1.5px solid #E6E5E0",
            background: "#fff",
            color: palette.navy,
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          {status.webauthnCredentials.length === 0
            ? t("addCredential")
            : t("addAnotherCredential")}
        </button>
      </div>

      {}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E6E5E0",
          borderRadius: 16,
          padding: 24,
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: palette.navy,
            marginBottom: 4,
          }}
        >
          {t("resetPassword")}
        </div>
        <p style={{ fontSize: 13, color: palette.muted, marginBottom: 16 }}>
          {t("resetPasswordDesc")}
        </p>
        <form onSubmit={resetPassword}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button
              type="button"
              onClick={() => setResetMethod("totp")}
              style={{
                flex: 1,
                padding: "9px",
                borderRadius: 9999,
                border: `1.5px solid ${
                  resetMethod === "totp" ? palette.accent : "#E6E5E0"
                }`,
                background:
                  resetMethod === "totp" ? palette.accentLight : "#fff",
                color: resetMethod === "totp" ? palette.navy : palette.muted,
                fontWeight: 600,
                fontSize: 12.5,
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
              }}
            >
              {t("authenticatorCode")}
            </button>
            <button
              type="button"
              onClick={() => setResetMethod("webauthn")}
              style={{
                flex: 1,
                padding: "9px",
                borderRadius: 9999,
                border: `1.5px solid ${
                  resetMethod === "webauthn" ? palette.accent : "#E6E5E0"
                }`,
                background:
                  resetMethod === "webauthn" ? palette.accentLight : "#fff",
                color:
                  resetMethod === "webauthn" ? palette.navy : palette.muted,
                fontWeight: 600,
                fontSize: 12.5,
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
              }}
            >
              {t("biometric")}
            </button>
          </div>

          {resetMethod === "totp" && (
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: palette.navy,
                  marginBottom: 7,
                }}
              >
                {t("currentAuthenticatorCode")}
              </label>
              <OtpInput value={resetTotpCode} onChange={setResetTotpCode} />
            </div>
          )}

          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: palette.navy,
                marginBottom: 7,
              }}
            >
              {t("newPassword")}
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("newPasswordPlaceholder")}
              required
              minLength={8}
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            disabled={busy === "reset"}
            style={{
              padding: "10px 24px",
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
            {resetMethod === "webauthn"
              ? t("verifyBiometricAndReset")
              : t("verifyAndResetPassword")}
          </button>
        </form>
      </div>
    </div>
  )
}
