import { isAxiosError } from "axios"

// Every dashboard hits the backend constantly (loads, actions, uploads).
// This is the one place that decides how a 4xx/5xx/network failure turns
// into a string a user can actually read, so every call site handles
// errors the same way instead of each view reinventing (or skipping) it.
export function getErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const message = err.response?.data?.message
    if (typeof message === "string") return message
    if (Array.isArray(message) && typeof message[0] === "string") {
      return message[0]
    }
  }
  return fallback
}
