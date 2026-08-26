import axiosLib from "axios"
import { increment, decrement } from "./loadingBar"

// NEXT_PUBLIC_API_URL points at wherever the *browser* can reach the API
// (through nginx, e.g. http://localhost/api/v1 in the self-hosted Docker
// stack) — but this module is also imported by Server Components, which
// run inside the frontend container itself, not the browser. In the
// docker-compose topology (nginx/frontend/backend as separate containers
// on the internal network) that browser-facing URL is unreachable from
// inside the frontend container: "localhost" there means the container's
// own loopback, not nginx, so every server-side call would get
// ECONNREFUSED — silently breaking every server-rendered page that needs
// the API, from ISR pages (which happen to catch and swallow the error,
// falling back to slower client-side fetching) to /dashboard's role
// redirect (which has no such fallback and hard-fails). INTERNAL_API_URL
// is the container-to-container address (docker-compose.yml sets it to
// http://backend:<port>/api/v1) — server-only, never prefixed
// NEXT_PUBLIC_, so it's never baked into the client bundle and simply
// doesn't exist in the browser.
const baseURL =
  typeof window === "undefined"
    ? (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL)
    : process.env.NEXT_PUBLIC_API_URL

// Every backend call goes through this instance — no raw fetch. In the
// browser, withCredentials carries the Clerk session cookie once the
// frontend and API share a domain in production; until then (and always
// for Server Components, which have no browser cookie jar to rely on),
// callers attach a bearer token explicitly via authHeader() below.
export const axios = axiosLib.create({
  baseURL,
  withCredentials: true,
  // Without this, a hung backend call (dropped connection, deadlocked
  // request) never resolves or rejects — the caller's try/catch never
  // fires, so a page like /dashboard just sits stuck forever instead of
  // surfacing its error/retry state. 15s is generous for anything this
  // app calls; nothing here is a long-running job.
  timeout: 15_000,
  // Required by the backend's CSRF header check on state-changing requests.
  headers: { "X-Requested-With": "XMLHttpRequest" },
})

export function authHeader(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Drives GlobalLoadingBar — every request through this instance increments
// the counter, every settle (success or failure) decrements it, so no
// caller has to opt in individually and a slow/hung page never *looks*
// stuck even before its own error/loading state kicks in.
axios.interceptors.request.use((config) => {
  increment()
  return config
})
axios.interceptors.response.use(
  (response) => {
    decrement()
    return response
  },
  (error) => {
    decrement()
    return Promise.reject(error)
  },
)
