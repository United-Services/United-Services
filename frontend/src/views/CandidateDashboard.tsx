"use client"
import { useEffect, useRef, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { InlineSpinner } from "../components/Spinner"
import { IconLogout } from "../components/NavIcons"
import { axios, authHeader } from "../lib/api"
import { ApplicationStatus } from "../enums/status.enums"

interface Props {
  onLogout: () => void
}

interface Application {
  id: string
  status: ApplicationStatus
  hasIdPhoto: boolean
  hasCv: boolean
  documentsRequested: boolean
  documentsRequestedNote: string | null
  position: { title: string; department: string } | null
}

const STATUS_COLORS: Record<ApplicationStatus, { bg: string; color: string }> = {
  [ApplicationStatus.Pending]: { bg: "#FEF3C7", color: "#92400E" },
  [ApplicationStatus.Approved]: { bg: "#DCFCE7", color: "#166534" },
  [ApplicationStatus.Denied]: { bg: "#FEE2E2", color: "#991B1B" },
}

export default function CandidateDashboard({ onLogout }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("candidateDashboard")
  const [app, setApp] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadingKind, setUploadingKind] = useState<
    "candidate-id-photo" | "candidate-cv" | null
  >(null)
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(
    null,
  )
  const idRef = useRef<HTMLInputElement>(null)
  const cvRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const token = await getToken()
    const { data } = await axios.get("/me/candidate-application", {
      headers: authHeader(token),
    })
    setApp(data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const uploadDocument = async (
    file: File,
    kind: "candidate-id-photo" | "candidate-cv",
  ) => {
    setUploadingKind(kind)
    setMessage(null)
    try {
      const token = await getToken()
      const headers = authHeader(token)
      const { data: presign } = await axios.post(
        "/uploads/presign",
        { kind, contentType: file.type },
        { headers },
      )
      await fetch(presign.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      })
      const field = kind === "candidate-id-photo" ? "idPhotoS3Key" : "cvS3Key"
      await axios.post(
        "/me/candidate-documents",
        { [field]: presign.key },
        { headers },
      )
      setMessage({ type: "ok", text: t("uploadSuccess") })
      await load()
    } catch {
      setMessage({ type: "error", text: t("uploadError") })
    } finally {
      setUploadingKind(null)
    }
  }

  if (loading || !app) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Poppins, sans-serif",
        }}
      >
        <InlineSpinner size={18} /> {t("loading")}
      </div>
    )
  }

  const statusColor = STATUS_COLORS[app.status]

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 32,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 800, color: palette.navy }}>
            {t("brand")}
          </div>
          <button
            onClick={onLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: palette.muted,
              fontSize: 13,
              fontFamily: "Poppins, sans-serif",
            }}
          >
            <IconLogout size={15} /> {t("logout")}
          </button>
        </div>

        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: palette.navy,
            marginBottom: 24,
            letterSpacing: "-0.02em",
          }}
        >
          {t("title")}
        </h1>

        <div
          style={{
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 16,
            padding: 24,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: palette.muted,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            {t("statusHeading")}
          </div>
          <span
            style={{
              display: "inline-block",
              fontSize: 13,
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: 9999,
              background: statusColor.bg,
              color: statusColor.color,
              marginBottom: 12,
            }}
          >
            {t(`status.${app.status}` as any)}
          </span>
          <p style={{ fontSize: 14, color: palette.slate, lineHeight: 1.7 }}>
            {t(`statusBody.${app.status}` as any)}
          </p>
        </div>

        {app.documentsRequested && (
          <div
            style={{
              background: "#FFFBEB",
              border: "1px solid #FCD34D",
              borderRadius: 16,
              padding: 20,
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>
              {t("documentsRequestedBanner")}
            </div>
            {app.documentsRequestedNote && (
              <p style={{ fontSize: 13, color: "#92400E" }}>
                {app.documentsRequestedNote}
              </p>
            )}
          </div>
        )}

        {message && (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 20,
              background: message.type === "ok" ? "#F0FDF4" : "#FEF2F2",
              color: message.type === "ok" ? "#16A34A" : "#DC2626",
            }}
          >
            {message.text}
          </div>
        )}

        <div
          style={{
            background: "#fff",
            border: "1px solid #E2E8F0",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: palette.muted,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            {t("documentsHeading")}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <DocumentSlot
              label={t("idLabel")}
              hasFile={app.hasIdPhoto}
              uploadLabel={t("uploadId")}
              replaceLabel={t("replace")}
              uploadedLabel={t("uploaded")}
              notUploadedLabel={t("notUploaded")}
              uploading={uploadingKind === "candidate-id-photo"}
              uploadingLabel={t("uploading")}
              accept="image/jpeg,image/png"
              inputRef={idRef}
              onFile={(f) => uploadDocument(f, "candidate-id-photo")}
            />
            <DocumentSlot
              label={t("cvLabel")}
              hasFile={app.hasCv}
              uploadLabel={t("uploadCv")}
              replaceLabel={t("replace")}
              uploadedLabel={t("uploaded")}
              notUploadedLabel={t("notUploaded")}
              uploading={uploadingKind === "candidate-cv"}
              uploadingLabel={t("uploading")}
              accept=".pdf,.doc,.docx"
              inputRef={cvRef}
              onFile={(f) => uploadDocument(f, "candidate-cv")}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function DocumentSlot({
  label,
  hasFile,
  uploadLabel,
  replaceLabel,
  uploadedLabel,
  notUploadedLabel,
  uploading,
  uploadingLabel,
  accept,
  inputRef,
  onFile,
}: {
  label: string
  hasFile: boolean
  uploadLabel: string
  replaceLabel: string
  uploadedLabel: string
  notUploadedLabel: string
  uploading: boolean
  uploadingLabel: string
  accept: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onFile: (f: File) => void
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>
        {label}
      </div>
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        style={{
          border: `2px dashed ${hasFile ? palette.accent : "#E2E8F0"}`,
          borderRadius: 14,
          padding: "20px",
          cursor: uploading ? "wait" : "pointer",
          textAlign: "center",
          background: hasFile ? "#FFF7ED" : "#F8FAFC",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.[0]) onFile(e.target.files[0])
            e.target.value = ""
          }}
        />
        <div style={{ fontSize: 24, marginBottom: 6 }}>{hasFile ? "✅" : "📄"}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: palette.navy, marginBottom: 4 }}>
          {hasFile ? uploadedLabel : notUploadedLabel}
        </div>
        <div style={{ fontSize: 11, color: palette.accent, fontWeight: 600 }}>
          {uploading ? uploadingLabel : hasFile ? replaceLabel : uploadLabel}
        </div>
      </div>
    </div>
  )
}
