"use client"
import { useEffect, useRef, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { InlineSpinner } from "../components/Spinner"
import { IconLogout } from "../components/NavIcons"
import { axios, authHeader } from "../lib/api"
import { ApplicationStatus } from "../enums/status.enums"
import { useRequestGuard } from "../lib/useRequestGuard"
import PublicNav from "../components/PublicNav"

interface Props {
  onLogout: () => void
  onNavigate: (page: string) => void
}

interface OtherDocument {
  id: string
  originalFilename: string
  uploadedAt: string
}

interface Application {
  id: string
  status: ApplicationStatus
  hasIdPhoto: boolean
  hasCv: boolean
  otherDocuments: OtherDocument[]
  documentsRequested: boolean
  documentsRequestedNote: string | null
  position: { title: string; department: string } | null
}

const STATUS_COLORS: Record<ApplicationStatus, { bg: string; color: string }> = {
  [ApplicationStatus.Pending]: { bg: "#FEF3C7", color: "#92400E" },
  [ApplicationStatus.Approved]: { bg: "#DCFCE7", color: "#166534" },
  [ApplicationStatus.Denied]: { bg: "#FEE2E2", color: "#991B1B" },
}

export default function CandidateDashboard({ onLogout, onNavigate }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("candidateDashboard")
  const [app, setApp] = useState<Application | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploadingKind, setUploadingKind] = useState<
    "candidate-id-photo" | "candidate-cv" | "candidate-other-document" | null
  >(null)
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(
    null,
  )
  const idRef = useRef<HTMLInputElement>(null)
  const cvRef = useRef<HTMLInputElement>(null)
  const otherRef = useRef<HTMLInputElement>(null)

  const loadGuard = useRequestGuard()
  const load = async () => {
    // Re-invoked after a successful upload and from the retry button below,
    // on top of the mount-time call — the guard stops a slow initial fetch
    // from landing after and overwriting fresher (e.g. post-upload) state.
    const reqId = loadGuard.start()
    try {
      const token = await getToken()
      const { data } = await axios.get("/me/candidate-application", {
        headers: authHeader(token),
      })
      if (loadGuard.stale(reqId)) return
      setApp(data)
    } catch {
      if (loadGuard.stale(reqId)) return
      setMessage({ type: "error", text: t("loadError") })
    } finally {
      if (!loadGuard.stale(reqId)) setLoading(false)
    }
  }

  useEffect(() => {
    // Standard fetch-on-mount (react.dev/learn/you-might-not-need-an-effect
    // explicitly endorses this shape) — load only touches state after its
    // own await, so nothing here sets state synchronously during this
    // effect's own execution.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const uploadOtherDocument = async (file: File) => {
    setUploadingKind("candidate-other-document")
    setMessage(null)
    try {
      const token = await getToken()
      const headers = authHeader(token)
      const { data: presign } = await axios.post(
        "/uploads/presign",
        { kind: "candidate-other-document", contentType: file.type },
        { headers },
      )
      await fetch(presign.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      })
      await axios.post(
        "/me/candidate-documents/other",
        { s3Key: presign.key, originalFilename: file.name },
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
      <div style={{ fontFamily: "Poppins, sans-serif" }}>
        <PublicNav current="candidate-dashboard" onNavigate={onNavigate} />
        <div
          style={{
            marginTop: 68,
            minHeight: "calc(100vh - 68px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
          }}
        >
        {loading ? (
          <>
            <InlineSpinner size={18} /> {t("loading")}
          </>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "#DC2626", fontWeight: 600 }}>
              {message?.text ?? t("loadError")}
            </div>
            <button
              onClick={() => {
                setLoading(true)
                load()
              }}
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
          </>
        )}
        </div>
      </div>
    )
  }

  const statusColor = STATUS_COLORS[app.status]

  return (
    <div style={{ fontFamily: "Poppins, sans-serif" }}>
      <PublicNav current="candidate-dashboard" onNavigate={onNavigate} />
      <div
        style={{
          marginTop: 68,
          minHeight: "calc(100vh - 68px)",
          background: "#F3F2EE",
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
            border: "1px solid #E6E5E0",
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
            border: "1px solid #E6E5E0",
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

        <div
          style={{
            background: "#fff",
            border: "1px solid #E6E5E0",
            borderRadius: 16,
            padding: 24,
            marginTop: 20,
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
            {t("otherDocumentsHeading")}
          </div>

          {app.otherDocuments.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px" }}>
              {app.otherDocuments.map((doc) => (
                <li
                  key={doc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    color: palette.slate,
                    padding: "8px 0",
                    borderBottom: "1px solid #F3F2EE",
                  }}
                >
                  <span>📄</span>
                  <span style={{ fontWeight: 600 }}>{doc.originalFilename}</span>
                </li>
              ))}
            </ul>
          )}

          {app.otherDocuments.length === 0 && (
            <p style={{ fontSize: 13, color: palette.muted, marginBottom: 16 }}>
              {t("noOtherDocuments")}
            </p>
          )}

          <div
            onClick={() =>
              uploadingKind !== "candidate-other-document" &&
              otherRef.current?.click()
            }
            style={{
              border: "2px dashed #E6E5E0",
              borderRadius: 14,
              padding: "16px",
              cursor: uploadingKind === "candidate-other-document" ? "wait" : "pointer",
              textAlign: "center",
              background: "#F3F2EE",
            }}
          >
            <input
              ref={otherRef}
              type="file"
              accept=".pdf,.doc,.docx,image/jpeg,image/png"
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files?.[0]) uploadOtherDocument(e.target.files[0])
                e.target.value = ""
              }}
            />
            <div style={{ fontSize: 12, fontWeight: 700, color: palette.accent }}>
              {uploadingKind === "candidate-other-document"
                ? t("uploading")
                : t("addOtherDocument")}
            </div>
          </div>
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
          border: `2px dashed ${hasFile ? palette.accent : palette.border}`,
          borderRadius: 14,
          padding: "20px",
          cursor: uploading ? "wait" : "pointer",
          textAlign: "center",
          background: hasFile ? palette.accentLight : palette.bgAlt,
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
