import axiosLib from "axios"

// Every backend call goes through this instance — no raw fetch. In the
// browser, withCredentials carries the Clerk session cookie once the
// frontend and API share a domain in production; until then (and always
// for Server Components, which have no browser cookie jar to rely on),
// callers attach a bearer token explicitly via authHeader() below.
export const axios = axiosLib.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1",
  withCredentials: true,
  // Without this, a hung backend call (dropped connection, deadlocked
  // request) never resolves or rejects — the caller's try/catch never
  // fires, so a page like /dashboard just sits stuck forever instead of
  // surfacing its error/retry state. 15s is generous for anything this
  // app calls; nothing here is a long-running job.
  timeout: 15_000,
  // Required by the backend's CsrfHeaderGuard on every state-changing
  // request: cookie-based auth alone can't distinguish this app's own
  // requests from a cross-site form submission, and a plain HTML form
  // can't set a custom header, so this closes that gap.
  headers: { "X-Requested-With": "XMLHttpRequest" },
})

export function authHeader(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}
