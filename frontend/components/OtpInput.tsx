"use client"

import { useRef } from "react"
import { palette } from "../theme"

interface Props {
  value: string
  onChange: (value: string) => void
  length?: number
  autoFocus?: boolean
  disabled?: boolean
  id?: string
  name?: string
}

// A per-digit boxed input for verification codes (email OTP, TOTP) —
// replaces a single free-text field with `length` single-character boxes
// that auto-advance on entry, support backspace-to-previous, arrow-key
// navigation, and pasting the full code into any box.
export default function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus,
  disabled,
  id,
  name,
}: Props) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const digits = Array.from({ length }, (_, i) => value[i] ?? "")

  const setDigit = (index: number, digit: string) => {
    const next = digits.slice()
    next[index] = digit
    onChange(next.join("").slice(0, length))
  }

  const focusIndex = (index: number) => {
    inputRefs.current[Math.max(0, Math.min(length - 1, index))]?.focus()
  }

  return (
    <div style={{ display: "flex", gap: 8 }} role="group" aria-label="Verification code">
      {digits.map((digit, i) => (
        <input
          key={i}
          id={i === 0 ? id : undefined}
          name={i === 0 ? name : undefined}
          ref={(el) => {
            inputRefs.current[i] = el
          }}
          className="us-focus-ring"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          value={digit}
          aria-label={`Digit ${i + 1} of ${length}`}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "")
            if (!raw) {
              setDigit(i, "")
              return
            }
            // Handle a fast typist or an IME committing more than one
            // character at once by spreading the extra digits forward.
            const chars = raw.split("")
            const next = digits.slice()
            chars.forEach((c, offset) => {
              if (i + offset < length) next[i + offset] = c
            })
            onChange(next.join("").slice(0, length))
            focusIndex(i + chars.length)
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digit) {
              e.preventDefault()
              focusIndex(i - 1)
              setDigit(i - 1, "")
            } else if (e.key === "ArrowLeft") {
              e.preventDefault()
              focusIndex(i - 1)
            } else if (e.key === "ArrowRight") {
              e.preventDefault()
              focusIndex(i + 1)
            }
          }}
          onPaste={(e) => {
            e.preventDefault()
            const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length)
            if (!pasted) return
            onChange(pasted)
            focusIndex(pasted.length - 1)
          }}
          style={{
            width: 44,
            height: 52,
            textAlign: "center",
            fontSize: 20,
            fontWeight: 700,
            fontFamily: "Poppins, sans-serif",
            borderRadius: 10,
            border: `1.5px solid ${palette.border}`,
            color: palette.navy,
            background: disabled ? palette.bgAlt : "#fff",
            outline: "none",
          }}
        />
      ))}
    </div>
  )
}
