// For the simple (non-chunked) presigned-PUT upload path — service spec
// files, service hero images, ticket screenshots. fetch() does NOT throw
// on a non-2xx response (only on a network-level failure), so an
// unchecked `await fetch(presign.url, { method: "PUT", ... })` silently
// treats a rejected/expired/CORS-blocked upload as a success: the caller
// sails straight into the next step (telling the backend "this key is
// ready to promote"), which then fails for an unrelated-looking reason
// (the object was never actually written) with the real cause nowhere
// in sight. Confirmed live: this was happening for real service-image
// uploads. Mirrors resumableUpload.ts's xhr.status check for the chunked
// upload path — same failure mode, same fix.
export class PresignedUploadError extends Error {}

export async function putToPresignedUrl(
  url: string,
  file: File | Blob,
  contentType: string,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": contentType },
    })
  } catch {
    throw new PresignedUploadError(
      "Network error while uploading — check your connection and retry.",
    )
  }
  if (!res.ok) {
    throw new PresignedUploadError(`Storage rejected the upload (HTTP ${res.status}).`)
  }
}
