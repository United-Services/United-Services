import { defineRouting } from "next-intl/routing"

export const routing = defineRouting({
  locales: ["en", "ar", "zh"],
  defaultLocale: "en",
  // Persists the visitor's explicit choice so it survives future visits —
  // satisfies "manual switch ... persists the choice (cookie)".
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
  },
})

export type AppLocale = typeof routing.locales[number]
