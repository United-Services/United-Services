"use client"
import { useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette, inputStyle } from "../theme"
import { InlineSpinner } from "../components/Spinner"
import { IconKeyRound } from "../components/NavIcons"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import PublicNav from "../components/PublicNav"

interface Props {
  onNavigate: (page: string) => void
}

export default function ChangePassword({ onNavigate }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("changePassword")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (newPassword.length < 8) {
      setError(t("errors.tooShort"))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t("errors.mismatch"))
      return
    }
    setLoading(true)
    try {
      const token = await getToken()
      await axios.post(
        "/me/change-password",
        { newPassword },
        { headers: authHeader(token) },
      )
      // signOutOfOtherSessions on the backend clears every session but this
      // one's cookie is already re-issued by the same request's response,
      // so the normal role-based redirect is safe to send them to next.
      onNavigate("dashboard")
    } catch (err) {
      setError(getErrorMessage(err, t("errors.failed")))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ fontFamily: "Poppins, sans-serif" }}>
      <PublicNav current="change-password" onNavigate={onNavigate} />
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 8,
            }}
          >
            <IconKeyRound size={22} />
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

          <form onSubmit={submit}>
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
                {t("newPasswordLabel")}
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: palette.navy,
                  marginBottom: 8,
                }}
              >
                {t("confirmPasswordLabel")}
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                style={inputStyle}
              />
            </div>

            {error && (
              <p
                style={{
                  fontSize: 13,
                  color: "#991B1B",
                  marginBottom: 16,
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
                background: palette.accent,
                color: "#fff",
                border: "none",
                borderRadius: 9999,
                padding: "12px 32px",
                fontWeight: 700,
                fontSize: 14,
                cursor: loading ? "default" : "pointer",
                fontFamily: "Poppins, sans-serif",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loading && <InlineSpinner size={14} />}
              {t("submit")}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
