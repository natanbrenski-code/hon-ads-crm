import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'HON Ads CRM',
  description: 'System zarządzania projektami HON Ads',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  )
}
