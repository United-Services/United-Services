import type { Metadata } from "next"
import { Poppins, Space_Grotesk, Inter } from "next/font/google"
import { hasLocale, NextIntlClientProvider } from "next-intl"
import { notFound } from "next/navigation"
import { ClerkProvider } from "@clerk/nextjs"
import { routing } from "@/i18n/routing"
import LanguagePrompt from "@/components/LanguagePrompt"
import PageViewTracker from "@/components/PageViewTracker"
import GlobalLoadingBar from "@/components/GlobalLoadingBar"
import PageTransition from "@/components/PageTransition"
import ChatWidget from "@/components/ChatWidget"
import "../globals.css"

export const metadata: Metadata = {
  title: "United Services Egypt",
  description:
    "Pipeline integrity and corrosion-control systems for the oil, gas, and power sectors.",
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

const RTL_LOCALES = new Set(["ar"])

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
  display: "swap",
})
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
})
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
})

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  const dir = RTL_LOCALES.has(locale) ? "rtl" : "ltr"

  return (
    <html
      lang={locale}
      dir={dir}
      className={`${poppins.variable} ${spaceGrotesk.variable} ${inter.variable}`}
    >
      <body>
        <ClerkProvider
          localization={{
            formFieldInputPlaceholder__emailAddress: "username@example.com",
          }}
        >
          <NextIntlClientProvider>
            <GlobalLoadingBar />
            <PageViewTracker />
            <PageTransition>{children}</PageTransition>
            {locale === routing.defaultLocale && <LanguagePrompt />}
            <ChatWidget />
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
