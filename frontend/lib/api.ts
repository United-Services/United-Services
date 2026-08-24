import axiosLib from "axios"
import { increment, decrement } from "./loadingBar"

// Every backend call goes through this instance — no raw fetch. In the
// browser, withCredentials carries the Clerk session cookie once the
// frontend and API share a domain in production; until then (and always
// for Server Components, which have no browser cookie jar to rely on),
// callers attach a bearer token explicitly via authHeader() below.
export const axios = axiosLib.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
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
