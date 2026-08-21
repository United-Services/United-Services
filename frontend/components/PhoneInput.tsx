"use client"

import { useState } from "react"
import { palette, inputStyle } from "../theme"
import { COUNTRIES, flagEmoji } from "../data/countries"

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  autoFocus?: boolean
}

// Splits a combined "+20 1012345678"-style value back into the dial code
// (matched against the known list, longest prefix first so e.g. "+1"
// doesn't shadow a country that also starts with "+1...") and the rest.
function splitValue(value: string): { dialCode: string; number: string } {
  const sorted = [...COUNTRIES].sort(
    (a, b) => b.dialCode.length - a.dialCode.length,
  )
  const match = sorted.find((c) => value.startsWith(c.dialCode))
  if (!match) return { dialCode: "+20", number: value }
  return { dialCode: match.dialCode, number: value.slice(match.dialCode.length).trim() }
}

export default function PhoneInput({
  value,
  onChange,
  placeholder,
  required,
  autoFocus,
}: Props) {
  const { dialCode, number } = splitValue(value)
  const [countryCode, setCountryCode] = useState(
    COUNTRIES.find((c) => c.dialCode === dialCode)?.code ?? "EG",
  )

  const emit = (nextCountryCode: string, nextNumber: string) => {
    const country = COUNTRIES.find((c) => c.code === nextCountryCode)
    const nextDialCode = country?.dialCode ?? "+20"
    onChange(nextNumber ? `${nextDialCode} ${nextNumber}` : "")
  }

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select
        value={countryCode}
        onChange={(e) => {
          setCountryCode(e.target.value)
          emit(e.target.value, number)
        }}
        aria-label="Country code"
        style={{
          ...inputStyle,
          width: "auto",
          flexShrink: 0,
          paddingRight: 8,
          cursor: "pointer",
        }}
        onFocus={(e) => {
          e.target.style.borderColor = palette.accent
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "#E6E5E0"
        }}
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {flagEmoji(c.code)} {c.dialCode}
          </option>
        ))}
      </select>
      <input
        autoFocus={autoFocus}
        type="tel"
        autoComplete="tel-national"
        value={number}
        onChange={(e) => emit(countryCode, e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{ ...inputStyle, flex: 1 }}
        onFocus={(e) => {
          e.target.style.borderColor = palette.accent
        }}
        onBlur={(e) => {
          e.target.style.borderColor = "#E6E5E0"
        }}
      />
    </div>
  )
}
