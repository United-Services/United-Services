import axiosLib from "axios"
import { axios, authHeader } from "./api"

export type UploadErrorCode = "too_large" | "unsupported_type" | "network" | "unknown"

export class ResumableUploadError extends Error {
  code: UploadErrorCode
  uploadState?: ResumableUploadState
  constructor(message: string, code: UploadErrorCode = "unknown") {
    super(message)
    this.code = code
  }
}

export interface ResumableUploadEndpoints {
  create: string
  presignPart: string
  complete: string
  abort: string
}

interface PartState {
  partNumber: number
  eTag: string
}

// Kept across a failed attempt so a retry only re-uploads the parts that
// never made it, instead of starting the file over from byte zero.
export interface ResumableUploadState {
  key: string
  uploadId: string
  partSize: number
  totalParts: number
  completed: PartState[]
}

// S3 requires every part but the last to be >= 5MB. Doubling past ~200
// parts keeps very large files from generating an excessive number of
// presign round trips.
const MIN_PART_SIZE = 6 * 1024 * 1024

function pickPartSize(fileSize: number): number {
  let size = MIN_PART_SIZE
  while (Math.ceil(fileSize / size) > 200) size *= 2
  return size
}

function partByteSize(partNumber: number, partSize: number, fileSize: number): number {
  const start = (partNumber - 1) * partSize
  return Math.min(partSize, fileSize - start)
}

function toUploadError(err: unknown): ResumableUploadError {
  if (err instanceof ResumableUploadError) return err
  if (axiosLib.isAxiosError(err)) {
    if (!err.response) {
      return new ResumableUploadError("Network error — check your connection and retry", "network")
    }
    const raw = err.response.data?.message
    const text = Array.isArray(raw) ? raw.join(", ") : raw || `Upload failed (HTTP ${err.response.status})`
    if (/too large/i.test(text)) return new ResumableUploadError(text, "too_large")
    if (/unsupported|does not match|accepted/i.test(text)) {
      return new ResumableUploadError(text, "unsupported_type")
    }
    return new ResumableUploadError(text, "unknown")
  }
  return new ResumableUploadError(err instanceof Error ? err.message : "Upload failed", "unknown")
}

function attachState(err: ResumableUploadError, state: ResumableUploadState | undefined): ResumableUploadError {
  if (state) err.uploadState = state
  return err
}

function uploadPartXhr(url: string, blob: Blob, onLoaded: (loaded: number) => void, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onLoaded(e.loaded)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const eTag = xhr.getResponseHeader("ETag")
        if (!eTag) {
          reject(new ResumableUploadError("Upload storage did not confirm the part — retry", "network"))
          return
        }
        resolve(eTag)
      } else {
        reject(new ResumableUploadError(`Storage rejected the upload (HTTP ${xhr.status})`, "network"))
      }
    }
    xhr.onerror = () => reject(new ResumableUploadError("Network error while uploading — check your connection and retry", "network"))
    xhr.onabort = () => reject(new ResumableUploadError("Upload cancelled", "network"))
    if (signal) {
      if (signal.aborted) {
        xhr.abort()
        return
      }
      signal.addEventListener("abort", () => xhr.abort())
    }
    xhr.send(blob)
  })
}

// Client-side pre-flight check — catches the common cases (wrong format,
// too large) instantly, before any network round trip.
export function validateFile(
  file: File,
  { maxBytes, allowedTypes }: { maxBytes: number; allowedTypes: string[] },
): string | null {
  if (!allowedTypes.includes(file.type)) {
    return `Unsupported file format (${file.type || "unknown"}). Accepted: ${allowedTypes.join(", ")}`
  }
  if (file.size > maxBytes) {
    return `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB) — the limit is ${Math.floor(maxBytes / (1024 * 1024))}MB`
  }
  return null
}

// Uploads `file` in chunks against the given endpoints, reporting progress
// as a 0..1 fraction. Pass back `state` (read off a thrown
// ResumableUploadError's `.uploadState`) to resume an interrupted upload —
// already-completed parts are skipped rather than re-sent.
export async function runResumableUpload(opts: {
  file: File
  endpoints: ResumableUploadEndpoints
  createFields?: Record<string, unknown>
  token: string | null
  state?: ResumableUploadState
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}): Promise<{ key: string }> {
  const { file, endpoints, createFields = {}, token, onProgress, signal } = opts
  let state = opts.state

  if (!state) {
    try {
      const res = await axios.post(
        endpoints.create,
        { ...createFields, contentType: file.type, fileSize: file.size },
        { headers: authHeader(token) },
      )
      const partSize = pickPartSize(file.size)
      state = {
        key: res.data.key,
        uploadId: res.data.uploadId,
        partSize,
        totalParts: Math.max(1, Math.ceil(file.size / partSize)),
        completed: [],
      }
    } catch (err) {
      throw toUploadError(err)
    }
  }

  const completedNumbers = new Set(state.completed.map((p) => p.partNumber))

  for (let partNumber = 1; partNumber <= state.totalParts; partNumber++) {
    if (completedNumbers.has(partNumber)) continue
    const start = (partNumber - 1) * state.partSize
    const end = Math.min(start + state.partSize, file.size)
    const blob = file.slice(start, end)

    let presignUrl: string
    try {
      const res = await axios.post(
        endpoints.presignPart,
        { key: state.key, uploadId: state.uploadId, partNumber },
        { headers: authHeader(token) },
      )
      presignUrl = res.data.url
    } catch (err) {
      throw attachState(toUploadError(err), state)
    }

    const priorBytes = state.completed.reduce(
      (sum, p) => sum + partByteSize(p.partNumber, state!.partSize, file.size),
      0,
    )

    let eTag: string
    try {
      eTag = await uploadPartXhr(
        presignUrl,
        blob,
        (loaded) => onProgress?.(Math.min(1, (priorBytes + loaded) / file.size)),
        signal,
      )
    } catch (err) {
      throw attachState(err instanceof ResumableUploadError ? err : toUploadError(err), state)
    }

    state.completed.push({ partNumber, eTag })
    onProgress?.(state.completed.length / state.totalParts >= 1 ? 1 : (priorBytes + (end - start)) / file.size)
  }

  try {
    await axios.post(
      endpoints.complete,
      { key: state.key, uploadId: state.uploadId, parts: state.completed },
      { headers: authHeader(token) },
    )
  } catch (err) {
    throw attachState(toUploadError(err), state)
  }

  return { key: state.key }
}

export async function abortResumableUpload(
  endpoints: ResumableUploadEndpoints,
  state: ResumableUploadState,
  token: string | null,
): Promise<void> {
  await axios
    .post(endpoints.abort, { key: state.key, uploadId: state.uploadId }, { headers: authHeader(token) })
    .catch(() => undefined)
}
