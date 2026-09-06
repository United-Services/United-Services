import { isAxiosError } from "axios"

// Every dashboard hits the backend constantly (loads, actions, uploads).
// This is the one place that decides how a 4xx/5xx/network failure turns
// into a string a user can actually read, so every call site handles
// errors the same way instead of each view reinventing (or skipping) it.
//
// Only a 4xx body's message is passed through: those are deliberate,
// user-facing responses (validation, "already requested", 403 reasons).
// A 5xx body is the backend's own generic "Internal server error", and
// a network failure has no body at all — surfacing either verbatim leaked
// internal phrasing into the UI and told the user nothing actionable.
// Both now get the caller's localized fallback.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const status = err.response?.status ?? 0
    if (status >= 400 && status < 500) {
      const message = err.response?.data?.message
      if (typeof message === "string") return message
      if (Array.isArray(message) && typeof message[0] === "string") {
        return message[0]
      }
    }
  }
  return fallback
}
