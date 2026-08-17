"use client"
import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { usePathname, useRouter } from "@/i18n/navigation"
import { routing } from "@/i18n/routing"
import { palette } from "../theme"

// Egypt for Arabic (this company's home market and primary Arabic-
// speaking audience) rather than a pan-Arabic/other-country flag — a
// judgment call, not a linguistic rule (Arabic has no single "the"
// national flag the way most languages don't either).
const FLAGS: Record<"en" | "ar" | "zh", string> = {
  en: "🇬🇧",
  ar: "🇪🇬",
  zh: "🇨🇳",
}

export default function LanguageSwitcher() {
  const t = useTranslations("language")
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const switchTo = (next: string) => {
    setOpen(false)
    router.replace(pathname, { locale: next })
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("label")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "#F8FAFC",
          color: palette.navy,
          border: "1.5px solid #E2E8F0",
          borderRadius: 9999,
          padding: "9px 16px",
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "Poppins, sans-serif",
        }}
      >
        <span aria-hidden="true">{FLAGS[locale as "en" | "ar" | "zh"]}</span>
        {t(locale as "en" | "ar" | "zh")}
        <span
          style={{
            fontSize: 10,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        >
          ▾
        </span>
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 90 }}
          />
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              insetInlineEnd: 0,
              background: "#fff",
              border: "1px solid #E2E8F0",
              borderRadius: 12,
              boxShadow: "0 12px 32px rgba(0,0,0,0.12)",
              overflow: "hidden",
              zIndex: 100,
              minWidth: 140,
            }}
          >
            {routing.locales.map((l) => (
              <button
                key={l}
                onClick={() => switchTo(l)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "start",
                  background: l === locale ? palette.accentLight : "#fff",
                  color: l === locale ? palette.accent : palette.slate,
                  border: "none",
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: l === locale ? 700 : 500,
                  cursor: "pointer",
                  fontFamily: "Poppins, sans-serif",
                }}
              >
                <span aria-hidden="true">{FLAGS[l]}</span>
                {t(l)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
