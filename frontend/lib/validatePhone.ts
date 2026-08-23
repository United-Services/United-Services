import { COUNTRIES } from "../data/countries"

// Every digit repeated (0000000, 1111111, ...).
const ALL_SAME_DIGIT = /^(\d)\1+$/

// Long enough runs to catch "123456"/"0123456789" and "987654"/
// "9876543210" as substrings, in either direction.
const ASCENDING_RUN = "01234567890123456789"
const DESCENDING_RUN = "98765432109876543210"

// Local-number length only (dial code excluded) — a real subscriber
// number is at minimum a few digits (some small-country numbers run as
// short as 7) and at most 12 or so; this is deliberately generous rather
// than exact-per-country, since this app doesn't maintain a full
// per-country length table.
const MIN_DIGITS = 6
const MAX_DIGITS = 12

// Returns an error-message key (for i18n) or null if the number looks
// like a real phone number — not exhaustive carrier-format validation,
// just enough to reject the obvious placeholder patterns (all the same
// digit, a keyboard-order run, too short/long) that a copy-pasted
// "1111111"/"123456"/"9876543" test value would produce.
export function validatePhoneNumber(fullValue: string): "empty" | "length" | "pattern" | null {
  const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length)
  const match = sorted.find((c) => fullValue.startsWith(c.dialCode))
  const local = match ? fullValue.slice(match.dialCode.length).trim() : fullValue
  const digits = local.replace(/\D/g, "")

  if (!digits) return "empty"
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return "length"
  if (ALL_SAME_DIGIT.test(digits)) return "pattern"
  if (digits.length >= 5 && (ASCENDING_RUN.includes(digits) || DESCENDING_RUN.includes(digits))) {
    return "pattern"
  }
  return null
}
