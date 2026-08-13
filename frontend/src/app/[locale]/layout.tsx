import type { Metadata } from 'next'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { notFound } from 'next/navigation'
import { ClerkProvider } from '@clerk/nextjs'
import { routing } from '@/i18n/routing'
import LanguagePrompt from '@/components/LanguagePrompt'
import '../globals.css'

export const metadata: Metadata = {
  title: 'United Services Egypt',
  description: 'Pipeline integrity and corrosion-control systems for the oil, gas, and power sectors.',
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

const RTL_LOCALES = new Set(['ar'])

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  const dir = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr'

  return (
    <html lang={locale} dir={dir}>
      <body>
        <ClerkProvider>
          <NextIntlClientProvider>
            {children}
            {locale === routing.defaultLocale && <LanguagePrompt />}
          </NextIntlClientProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
