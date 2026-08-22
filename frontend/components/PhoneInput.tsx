"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { palette, inputStyle } from "../theme"
import { COUNTRIES, flagEmoji, type Country } from "../data/countries"

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

function matchesQuery(country: Country, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return (
    country.name.toLowerCase().includes(q) ||
    country.dialCode.includes(q.startsWith("+") ? q : `+${q}`) ||
    country.dialCode.replace("+", "").includes(q.replace("+", ""))
  )
}

export default function PhoneInput({
  value,
  onChange,
  placeholder,
  required,
  autoFocus,
}: Props) {
  const t = useTranslations("phoneInput")
  const { dialCode, number } = splitValue(value)
  const [countryCode, setCountryCode] = useState(
    COUNTRIES.find((c) => c.dialCode === dialCode)?.code ?? "EG",
  )
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = COUNTRIES.find((c) => c.code === countryCode)
  const filtered = COUNTRIES.filter((c) => matchesQuery(c, query))

  const emit = (nextCountryCode: string, nextNumber: string) => {
    const country = COUNTRIES.find((c) => c.code === nextCountryCode)
    const nextDialCode = country?.dialCode ?? "+20"
    onChange(nextNumber ? `${nextDialCode} ${nextNumber}` : "")
  }

  const selectCountry = (code: string) => {
    setCountryCode(code)
    emit(code, number)
    setOpen(false)
    setQuery("")
  }

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    document.addEventListener("keydown", onEscape)
    return () => {
      document.removeEventListener("mousedown", onClickOutside)
      document.removeEventListener("keydown", onEscape)
    }
  }, [open])

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div ref={rootRef} style={{ position: "relative", flexShrink: 0 }}>
        <button
          type="button"
          className="us-focus-ring"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Country code"
          style={{
            ...inputStyle,
            width: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingRight: 10,
            cursor: "pointer",
            background: "#fff",
          }}
        >
          <span>{flagEmoji(countryCode)}</span>
          <span>{selected?.dialCode ?? "+20"}</span>
          <span style={{ fontSize: 10, color: palette.muted, marginLeft: 2 }}>▾</span>
        </button>

        {open && (
          <div
            role="listbox"
            aria-label="Select a country"
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 50,
              width: 260,
              maxHeight: 320,
              background: "#fff",
              border: `1.5px solid ${palette.border}`,
              borderRadius: 12,
              boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 8, borderBottom: `1px solid ${palette.border}` }}>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${palette.border}`,
                  fontSize: 13,
                  fontFamily: "Poppins, sans-serif",
                  outline: "none",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filtered[0]) {
                    e.preventDefault()
                    selectCountry(filtered[0].code)
                  }
                }}
              />
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {filtered.length === 0 && (
                <div style={{ padding: "16px 12px", fontSize: 13, color: palette.muted, textAlign: "center" }}>
                  {t("noResults", { query })}
                </div>
              )}
              {filtered.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  role="option"
                  aria-selected={c.code === countryCode}
                  onClick={() => selectCountry(c.code)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "9px 12px",
                    background: c.code === countryCode ? palette.accentLight : "transparent",
                    border: "none",
                    borderLeft: c.code === countryCode ? `3px solid ${palette.accent}` : "3px solid transparent",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: 13,
                    fontFamily: "Poppins, sans-serif",
                    color: palette.navy,
                  }}
                  onMouseEnter={(e) => {
                    if (c.code !== countryCode) e.currentTarget.style.background = palette.bgAlt
                  }}
                  onMouseLeave={(e) => {
                    if (c.code !== countryCode) e.currentTarget.style.background = "transparent"
                  }}
                >
                  <span>{flagEmoji(c.code)}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </span>
                  <span style={{ color: palette.muted, flexShrink: 0 }}>{c.dialCode}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
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
