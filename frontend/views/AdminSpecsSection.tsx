"use client"

import { useEffect, useRef, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { useTranslations } from "next-intl"
import { palette } from "../theme"
import { InlineSpinner } from "../components/Spinner"
import { axios, authHeader } from "../lib/api"
import { getErrorMessage } from "../lib/errors"
import { putToPresignedUrl, PresignedUploadError } from "../lib/uploadToS3"
import { fieldLabelStyle, fieldInputStyle } from "./adminShared"
import { SkeletonCard } from "../components/Skeleton"

interface Service {
  id: string
  slug: string
  name: string
  shortDescription: string
  longDescription: string
  specs: string[]
  order: number
  imageUrl: string | null
}
interface ServiceFile {
  id: string
  originalFilename: string
  version: number
  uploadedAt: string
}

interface Props {
  setError: (message: string | null) => void
}

export default function AdminSpecsSection({ setError }: Props) {
  const { getToken } = useAuth()
  const t = useTranslations("adminDashboard")
  const tCommon = useTranslations("common")
  const authed = async () => authHeader(await getToken())

  const [services, setServices] = useState<Service[]>([])
  const [serviceFiles, setServiceFiles] =
    useState<Record<string, ServiceFile[]>>({})
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(
    null,
  )
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [editingServiceId, setEditingServiceId] = useState<string | null>(
    null,
  )
  const [serviceEditForm, setServiceEditForm] = useState({
    name: "",
    shortDescription: "",
    longDescription: "",
    specs: "",
  })
  const [savingService, setSavingService] = useState(false)
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(
    null,
  )
  const [showCreateServiceForm, setShowCreateServiceForm] = useState(false)
  const [newServiceForm, setNewServiceForm] = useState({
    slug: "",
    name: "",
    shortDescription: "",
    longDescription: "",
    specs: "",
  })
  const [creatingService, setCreatingService] = useState(false)
  const [servicesLoading, setServicesLoading] = useState(true)

  const loadServices = async () => {
    try {
      const headers = await authed()
      const { data } = await axios.get("/services", { headers })
      setServices(data)

      // Batched — the card list only ever displays each service's latest
      // file (see `files[0]` below), so one request for all of them
      // replaces what used to be one /services/:id/files round trip per
      // card. A single service's full version history is still fetched
      // individually, but only right after that one service's own
      // upload/edit action, never at page load.
      if (data.length > 0) {
        const ids = data.map((s: Service) => s.id).join(",")
        const { data: latestFiles } = await axios.get("/services/latest-files", {
          headers,
          params: { ids },
        })
        const entries: [string, ServiceFile[]][] = Object.entries(
          latestFiles as Record<string, ServiceFile>,
        ).map(([serviceId, file]) => [serviceId, [file]])
        setServiceFiles(Object.fromEntries(entries))
      } else {
        setServiceFiles({})
      }
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.loadFailed")))
    } finally {
      setServicesLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadServices()
  }, [])

  const uploadSpec = (serviceId: string) =>
    fileInputRefs.current[serviceId]?.click()

  const handleFileSelected = async (serviceId: string, file: File) => {
    setUploadingId(serviceId)
    try {
      const headers = await authed()
      const { data: presign } = await axios.post(
        `/services/${serviceId}/files/presign`,
        {
          filename: file.name,
          contentType: file.type || "application/octet-stream",
        },
        { headers },
      )
      await putToPresignedUrl(
        presign.url,
        file,
        file.type || "application/octet-stream",
      )
      await axios.post(
        `/services/${serviceId}/files`,
        { s3Key: presign.key, originalFilename: file.name },
        { headers },
      )
      const { data: files } = await axios.get(`/services/${serviceId}/files`, {
        headers,
      })
      setServiceFiles((prev) => ({ ...prev, [serviceId]: files }))
    } catch (err) {
      setError(
        err instanceof PresignedUploadError
          ? err.message
          : getErrorMessage(err, tCommon("errors.actionFailed")),
      )
    } finally {
      setUploadingId(null)
    }
  }

  const uploadServiceImage = (serviceId: string) =>
    imageInputRefs.current[serviceId]?.click()

  const handleServiceImageSelected = async (
    serviceId: string,
    file: File,
  ) => {
    setUploadingImageId(serviceId)
    try {
      const headers = await authed()
      const { data: presign } = await axios.post(
        `/services/${serviceId}/image/presign`,
        { contentType: file.type },
        { headers },
      )
      await putToPresignedUrl(presign.url, file, file.type)
      const { data: updated } = await axios.post(
        `/services/${serviceId}/image`,
        { s3Key: presign.key },
        { headers },
      )
      setServices((prev) =>
        prev.map((s) => (s.id === serviceId ? { ...s, ...updated } : s)),
      )
    } catch (err) {
      setError(
        err instanceof PresignedUploadError
          ? err.message
          : getErrorMessage(err, tCommon("errors.actionFailed")),
      )
    } finally {
      setUploadingImageId(null)
    }
  }

  const startEditService = (svc: Service) => {
    setEditingServiceId(svc.id)
    setServiceEditForm({
      name: svc.name,
      shortDescription: svc.shortDescription,
      longDescription: svc.longDescription,
      specs: svc.specs.join(", "),
    })
  }

  const cancelEditService = () => setEditingServiceId(null)

  const saveServiceEdit = async (serviceId: string) => {
    setSavingService(true)
    try {
      const headers = await authed()
      const { data: updated } = await axios.patch(
        `/services/${serviceId}`,
        {
          name: serviceEditForm.name,
          shortDescription: serviceEditForm.shortDescription,
          longDescription: serviceEditForm.longDescription,
          specs: serviceEditForm.specs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        { headers },
      )
      setServices((prev) =>
        prev.map((s) => (s.id === serviceId ? { ...s, ...updated } : s)),
      )
      setEditingServiceId(null)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setSavingService(false)
    }
  }

  const deleteService = async (svc: Service) => {
    if (!window.confirm(t("specs.confirmDelete", { name: svc.name }))) return
    setDeletingServiceId(svc.id)
    try {
      const headers = await authed()
      await axios.delete(`/services/${svc.id}`, { headers })
      setServices((prev) => prev.filter((s) => s.id !== svc.id))
      setServiceFiles((prev) => {
        const next = { ...prev }
        delete next[svc.id]
        return next
      })
    } catch (err) {
      // The backend's message is specific and actionable here (e.g. "has
      // existing RFQs against it") — worth showing over the generic
      // fallback, which getErrorMessage already does when present.
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setDeletingServiceId(null)
    }
  }

  const createService = async (e: React.FormEvent) => {
    e.preventDefault()
    if (
      !newServiceForm.slug ||
      !newServiceForm.name ||
      !newServiceForm.shortDescription ||
      !newServiceForm.longDescription
    )
      return
    setCreatingService(true)
    try {
      const headers = await authed()
      const { data: created } = await axios.post(
        "/services",
        {
          slug: newServiceForm.slug,
          name: newServiceForm.name,
          shortDescription: newServiceForm.shortDescription,
          longDescription: newServiceForm.longDescription,
          specs: newServiceForm.specs
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
        { headers },
      )
      setServices((prev) => [...prev, created])
      setNewServiceForm({
        slug: "",
        name: "",
        shortDescription: "",
        longDescription: "",
        specs: "",
      })
      setShowCreateServiceForm(false)
    } catch (err) {
      setError(getErrorMessage(err, tCommon("errors.actionFailed")))
    } finally {
      setCreatingService(false)
    }
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button
          onClick={() => setShowCreateServiceForm((v) => !v)}
          style={{
            padding: "10px 22px",
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
          {showCreateServiceForm
            ? t("specs.cancel")
            : t("specs.addService")}
        </button>
      </div>

      {showCreateServiceForm && (
        <form
          onSubmit={createService}
          style={{
            background: "#fff",
            borderRadius: 16,
            border: "1px solid #E6E5E0",
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: palette.navy,
              marginBottom: 14,
            }}
          >
            {t("specs.createHeading")}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <label style={fieldLabelStyle}>{t("specs.slug")}</label>
              <input
                value={newServiceForm.slug}
                onChange={(e) =>
                  setNewServiceForm((f) => ({
                    ...f,
                    slug: e.target.value,
                  }))
                }
                placeholder={t("specs.slugPlaceholder")}
                required
                style={fieldInputStyle}
              />
            </div>
            <div>
              <label style={fieldLabelStyle}>{t("specs.name")}</label>
              <input
                value={newServiceForm.name}
                onChange={(e) =>
                  setNewServiceForm((f) => ({
                    ...f,
                    name: e.target.value,
                  }))
                }
                placeholder={t("specs.namePlaceholder")}
                required
                style={fieldInputStyle}
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={fieldLabelStyle}>
              {t("specs.shortDescription")}
            </label>
            <input
              value={newServiceForm.shortDescription}
              onChange={(e) =>
                setNewServiceForm((f) => ({
                  ...f,
                  shortDescription: e.target.value,
                }))
              }
              placeholder={t("specs.shortDescriptionPlaceholder")}
              required
              style={fieldInputStyle}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={fieldLabelStyle}>
              {t("specs.longDescription")}
            </label>
            <textarea
              value={newServiceForm.longDescription}
              onChange={(e) =>
                setNewServiceForm((f) => ({
                  ...f,
                  longDescription: e.target.value,
                }))
              }
              placeholder={t("specs.longDescriptionPlaceholder")}
              required
              rows={3}
              style={{ ...fieldInputStyle, resize: "vertical" }}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={fieldLabelStyle}>
              {t("specs.specsLabel")}
            </label>
            <input
              value={newServiceForm.specs}
              onChange={(e) =>
                setNewServiceForm((f) => ({
                  ...f,
                  specs: e.target.value,
                }))
              }
              placeholder={t("specs.specsPlaceholder")}
              style={fieldInputStyle}
            />
          </div>
          <button
            type="submit"
            disabled={creatingService}
            style={{
              padding: "10px 22px",
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
            {creatingService && <InlineSpinner size={13} />}{" "}
            {t("specs.createService")}
          </button>
        </form>
      )}

      <div
        className="responsive-card-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
        }}
      >
        {servicesLoading &&
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} height={220} />)}
        {!servicesLoading && services.map((svc) => {
          const files = serviceFiles[svc.id] ?? []
          const latest = files[0]
          const editing = editingServiceId === svc.id
          return (
            <div
              key={svc.id}
              style={{
                background: "#fff",
                borderRadius: 16,
                padding: "22px",
                border: `1px solid ${
                  latest ? palette.accent : "#E6E5E0"
                }`,
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "16/9",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "#F3F2EE",
                  marginBottom: 14,
                }}
              >
                {svc.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- admin-only tool, S3 presigned URL not known to next/image at build time
                  <img
                    src={svc.imageUrl}
                    alt={svc.name}
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                )}
              </div>
              <input
                ref={(el) => {
                  imageInputRefs.current[svc.id] = el
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleServiceImageSelected(svc.id, f)
                }}
              />
              <button
                onClick={() => uploadServiceImage(svc.id)}
                disabled={uploadingImageId === svc.id}
                style={{
                  width: "100%",
                  padding: "8px",
                  marginBottom: 14,
                  background: "#F3F2EE",
                  color: palette.slate,
                  border: "none",
                  borderRadius: 9999,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "Poppins, sans-serif",
                }}
              >
                {uploadingImageId === svc.id ? (
                  <>
                    <InlineSpinner size={12} /> {t("specs.uploading")}
                  </>
                ) : svc.imageUrl ? (
                  t("specs.replaceImage")
                ) : (
                  t("specs.uploadImage")
                )}
              </button>

              {editing ? (
                <div style={{ marginBottom: 14 }}>
                  <input
                    value={serviceEditForm.name}
                    onChange={(e) =>
                      setServiceEditForm((f) => ({
                        ...f,
                        name: e.target.value,
                      }))
                    }
                    placeholder={t("specs.name")}
                    style={{ ...fieldInputStyle, marginBottom: 8 }}
                  />
                  <input
                    value={serviceEditForm.shortDescription}
                    onChange={(e) =>
                      setServiceEditForm((f) => ({
                        ...f,
                        shortDescription: e.target.value,
                      }))
                    }
                    placeholder={t("specs.shortDescription")}
                    style={{ ...fieldInputStyle, marginBottom: 8 }}
                  />
                  <textarea
                    value={serviceEditForm.longDescription}
                    onChange={(e) =>
                      setServiceEditForm((f) => ({
                        ...f,
                        longDescription: e.target.value,
                      }))
                    }
                    placeholder={t("specs.longDescription")}
                    rows={3}
                    style={{
                      ...fieldInputStyle,
                      resize: "vertical",
                      marginBottom: 8,
                    }}
                  />
                  <input
                    value={serviceEditForm.specs}
                    onChange={(e) =>
                      setServiceEditForm((f) => ({
                        ...f,
                        specs: e.target.value,
                      }))
                    }
                    placeholder={t("specs.specsPlaceholder")}
                    style={fieldInputStyle}
                  />
                </div>
              ) : (
                <>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: palette.navy,
                      marginBottom: 4,
                    }}
                  >
                    {svc.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: palette.muted,
                      marginBottom: 14,
                    }}
                  >
                    {svc.shortDescription}
                  </div>
                </>
              )}

              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {editing ? (
                  <>
                    <button
                      onClick={() => saveServiceEdit(svc.id)}
                      disabled={savingService}
                      style={{
                        flex: 1,
                        padding: "8px",
                        background: palette.accent,
                        color: palette.navy,
                        border: "none",
                        borderRadius: 9999,
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: "pointer",
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      {savingService ? (
                        <InlineSpinner size={12} />
                      ) : (
                        t("specs.save")
                      )}
                    </button>
                    <button
                      onClick={cancelEditService}
                      style={{
                        flex: 1,
                        padding: "8px",
                        background: "#fff",
                        color: palette.navy,
                        border: "1.5px solid #E6E5E0",
                        borderRadius: 9999,
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: "pointer",
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      {t("specs.cancel")}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEditService(svc)}
                      style={{
                        flex: 1,
                        padding: "8px",
                        background: "#fff",
                        color: palette.navy,
                        border: "1.5px solid #E6E5E0",
                        borderRadius: 9999,
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: "pointer",
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      {t("specs.edit")}
                    </button>
                    <button
                      onClick={() => deleteService(svc)}
                      disabled={deletingServiceId === svc.id}
                      style={{
                        flex: 1,
                        padding: "8px",
                        background: "#fff",
                        color: "#DC2626",
                        border: "1.5px solid #FCA5A5",
                        borderRadius: 9999,
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: "pointer",
                        fontFamily: "Poppins, sans-serif",
                      }}
                    >
                      {deletingServiceId === svc.id ? (
                        <InlineSpinner size={12} />
                      ) : (
                        t("specs.delete")
                      )}
                    </button>
                  </>
                )}
              </div>

              {latest ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "#059669",
                    fontWeight: 600,
                    marginBottom: 14,
                  }}
                >
                  ✅ {latest.originalFilename} (v{latest.version})
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 12,
                    color: palette.muted,
                    marginBottom: 14,
                  }}
                >
                  {t("specs.noFile")}
                </div>
              )}
              <input
                ref={(el) => {
                  fileInputRefs.current[svc.id] = el
                }}
                type="file"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFileSelected(svc.id, f)
                }}
              />
              <button
                onClick={() => uploadSpec(svc.id)}
                disabled={uploadingId === svc.id}
                style={{
                  width: "100%",
                  padding: "9px",
                  background: latest ? "#F3F2EE" : palette.accent,
                  color: latest ? palette.slate : palette.navy,
                  border: "none",
                  borderRadius: 9999,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "Poppins, sans-serif",
                }}
              >
                {uploadingId === svc.id ? (
                  <>
                    <InlineSpinner size={13} /> {t("specs.uploading")}
                  </>
                ) : latest ? (
                  t("specs.replaceFile")
                ) : (
                  t("specs.uploadFile")
                )}
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
