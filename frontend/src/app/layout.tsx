import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'United Services Egypt',
  description: 'Pipeline integrity and corrosion-control systems for the oil, gas, and power sectors.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          {children}
        </ClerkProvider>
      </body>
    </html>
  )
}