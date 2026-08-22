"use client"
import { useEffect, useRef, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { Skeleton, SkeletonCards } from "../components/Skeleton"
import { IconLogout } from "../components/NavIcons"
import UploadProgress from "../components/UploadProgress"
import { axios, authHeader } from "../lib/api"
import {
  runResumableUpload,
  validateFile,
  ResumableUploadError,
  type ResumableUploadEndpoints,
  type ResumableUploadState,
} from "../lib/resumableUpload"
import { ApplicationStatus } from "../enums/status.enums"
import { useRequestGuard } from "../lib/useRequestGuard"
import PublicNav from "../components/PublicNav"

type UploadKind = "candidate-id-photo" | "candidate-cv" | "candidate-other-document"

const UPLOAD_ENDPOINTS: ResumableUploadEndpoints = {
  create: "/uploads/multipart/create",
  presignPart: "/uploads/multipart/presign-part",
  complete: "/uploads/multipart/complete",
  abort: "/uploads/multipart/abort",
}

const MAX_UPLOAD_BYTES: Record<UploadKind, number> = {
  "candidate-id-photo": 8 * 1024 * 1024,
  "candidate-cv": 15 * 1024 * 1024,
  "candidate-other-document": 20 * 1024 * 1024,
}

const ALLOWED_UPLOAD_TYPES: Record<UploadKind, string[]> = {
  "candidate-id-photo": ["image/jpeg", "image/png"],
  "candidate-cv": [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  "candidate-other-document": [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
  ],
}

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
  const [uploadProgress, setUploadProgress] = useState<Partial<Record<UploadKind, number>>>({})
  const [uploadError, setUploadError] = useState<Partial<Record<UploadKind, string>>>({})
  const pendingUploads = useRef<
    Map<UploadKind, { file: File; state?: ResumableUploadState }>
  >(new Map())

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

  // Shared by all three document kinds — uploads in chunks via
  // lib/resumableUpload so a dropped connection only loses the parts still
  // in flight, and stashes the returned state in pendingUploads so
  // retryUpload() below can resume instead of restarting the whole file.
  const performUpload = async (kind: UploadKind, file: File, resume = false) => {
    setUploadingKind(kind)
    setUploadError((prev) => ({ ...prev, [kind]: undefined }))
    setUploadProgress((prev) => ({ ...prev, [kind]: 0 }))
    setMessage(null)
    const existing = resume ? pendingUploads.current.get(kind) : undefined
    try {
      const token = await getToken()
      const headers = authHeader(token)
      const result = await runResumableUpload({
        file,
        endpoints: UPLOAD_ENDPOINTS,
        createFields: { kind },
        token,
        state: existing?.state,
        onProgress: (fraction) => setUploadProgress((prev) => ({ ...prev, [kind]: fraction })),
      })
      pendingUploads.current.delete(kind)

      if (kind === "candidate-other-document") {
        await axios.post(
          "/me/candidate-documents/other",
          { s3Key: result.key, originalFilename: file.name },
          { headers },
        )
      } else {
        const field = kind === "candidate-id-photo" ? "idPhotoS3Key" : "cvS3Key"
        await axios.post("/me/candidate-documents", { [field]: result.key }, { headers })
      }

      setUploadProgress((prev) => ({ ...prev, [kind]: 1 }))
      setMessage({ type: "ok", text: t("uploadSuccess") })
      await load()
    } catch (err) {
      const uploadErr = err instanceof ResumableUploadError ? err : undefined
      pendingUploads.current.set(kind, { file, state: uploadErr?.uploadState })
      setUploadError((prev) => ({
        ...prev,
        [kind]: uploadErr?.message ?? t("uploadError"),
      }))
    } finally {
      setUploadingKind(null)
    }
  }

  const startUpload = (kind: UploadKind, file: File) => {
    const validationError = validateFile(file, {
      maxBytes: MAX_UPLOAD_BYTES[kind],
      allowedTypes: ALLOWED_UPLOAD_TYPES[kind],
    })
    if (validationError) {
      setUploadError((prev) => ({ ...prev, [kind]: validationError }))
      return
    }
    pendingUploads.current.set(kind, { file })
    performUpload(kind, file)
  }

  const retryUpload = (kind: UploadKind) => {
    const pending = pendingUploads.current.get(kind)
    if (pending) performUpload(kind, pending.file, true)
  }

  const uploadDocument = (file: File, kind: "candidate-id-photo" | "candidate-cv") =>
    startUpload(kind, file)

  const uploadOtherDocument = (file: File) => startUpload("candidate-other-document", file)

  if (loading || !app) {
    return (
      <div style={{ fontFamily: "Poppins, sans-serif" }}>
        <PublicNav current="candidate-dashboard" onNavigate={onNavigate} />
        <div
          style={{
            marginTop: 68,
            minHeight: "calc(100vh - 68px)",
            display: loading ? "block" : "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: loading ? "32px 24px" : undefined,
          }}
        >
        {loading ? (
          <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
            <Skeleton height={28} width="35%" style={{ marginBottom: 24 }} />
            <SkeletonCards count={3} />
          </div>
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
              progress={uploadProgress["candidate-id-photo"] ?? null}
              error={uploadError["candidate-id-photo"] ?? null}
              onRetry={() => retryUpload("candidate-id-photo")}
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
              progress={uploadProgress["candidate-cv"] ?? null}
              error={uploadError["candidate-cv"] ?? null}
              onRetry={() => retryUpload("candidate-cv")}
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
            role="button"
            tabIndex={0}
            aria-label={t("addOtherDocument")}
            onClick={() =>
              uploadingKind !== "candidate-other-document" &&
              otherRef.current?.click()
            }
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return
              e.preventDefault()
              if (uploadingKind !== "candidate-other-document") otherRef.current?.click()
            }}
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
            <div style={{ fontSize: 12, fontWeight: 700, color: palette.navy }}>
              {uploadingKind === "candidate-other-document"
                ? t("uploading")
                : t("addOtherDocument")}
            </div>
          </div>
          <UploadProgress
            fraction={
              uploadingKind === "candidate-other-document"
                ? uploadProgress["candidate-other-document"] ?? 0
                : null
            }
            error={uploadError["candidate-other-document"] ?? null}
            onRetry={() => retryUpload("candidate-other-document")}
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
  progress = null,
  error = null,
  onRetry,
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
  progress?: number | null
  error?: string | null
  onRetry?: () => void
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: palette.navy, marginBottom: 8 }}>
        {label}
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-label={hasFile ? replaceLabel : uploadLabel}
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return
          e.preventDefault()
          if (!uploading) inputRef.current?.click()
        }}
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
        <div style={{ fontSize: 11, color: palette.navy, fontWeight: 600 }}>
          {uploading ? uploadingLabel : hasFile ? replaceLabel : uploadLabel}
        </div>
      </div>
      <UploadProgress
        fraction={uploading ? (progress ?? 0) : null}
        error={error}
        onRetry={onRetry}
      />
    </div>
  )
}
