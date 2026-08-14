"use client"

// Default locale is always English (see routing.ts + middleware.ts — no
// server-side geo redirect). This banner is the only geo-driven language
// behavior: it asks, it never switches without an explicit "yes".

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "@/i18n/navigation"
import { axios } from "@/lib/api"
import { palette } from "../theme"

const DISMISSED_KEY = "use_lang_prompt_dismissed"

type SwitchableLocale = "ar" | "zh"

const COPY: Record<SwitchableLocale, {
  question: string
  switchLabel: string
  dismissLabel: string
  dir: "rtl" | "ltr"
}> = {
  ar: {
    question:
      "يبدو أنك تزور الموقع من منطقة يُفضَّل فيها العربية. هل ترغب في التبديل إلى العربية؟",
    switchLabel: "التبديل إلى العربية",
    dismissLabel: "المتابعة بالإنجليزية",
    dir: "rtl",
  },
  zh: {
    question: "我们注意到您可能更习惯使用中文浏览本网站。是否切换到中文？",
    switchLabel: "切换到中文",
    dismissLabel: "继续使用英文",
    dir: "ltr",
  },
}
export default function LanguagePrompt() {
  const pathname = usePathname()
  const router = useRouter()
  const [detected, setDetected] = useState<SwitchableLocale | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.localStorage.getItem(DISMISSED_KEY)) return

    let cancelled = false
    axios
      .get("/geo/locale")
      .then(({ data }) => {
        if (cancelled) return
        if (data?.locale === "ar" || data?.locale === "zh") {
          setDetected(data.locale)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, "1")
    setDetected(null)
  }

  const switchLocale = () => {
    if (!detected) return
    window.localStorage.setItem(DISMISSED_KEY, "1")
    router.replace(pathname, { locale: detected })
  }

  if (!detected) return null
  const copy = COPY[detected]

  return (
    <div
      dir={copy.dir}
      style={{
        position: "fixed",
        bottom: 20,
        insetInlineStart: "50%",
        transform: "translateX(-50%)",
        zIndex: 200,
        maxWidth: "min(92vw, 480px)",
        background: palette.navy,
        color: "#fff",
        borderRadius: 16,
        padding: "18px 20px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        fontFamily: "Poppins, sans-serif",
      }}
    >
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>{copy.question}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={switchLocale}
          style={{
            background: palette.accent,
            color: "#fff",
            border: "none",
            borderRadius: 9999,
            padding: "9px 18px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          {copy.switchLabel}
        </button>
        <button
          onClick={dismiss}
          style={{
            background: "rgba(255,255,255,0.1)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 9999,
            padding: "9px 18px",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          {copy.dismissLabel}
        </button>
      </div>
    </div>
  )
}
