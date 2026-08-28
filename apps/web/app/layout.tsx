import type { Metadata } from 'next'
import { Archivo, JetBrains_Mono } from 'next/font/google'
import { ToastProvider } from '@/components/ui/Toast'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import './globals.css'

// Archivo: grotesk with signage lineage, variable weight + width. Tek aile,
// agirlik ve genislik kontrastiyla hiyerarsi kuruyor.
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  axes: ['wdth'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'LifeOS — Your Personal Life OS',
    template: '%s | LifeOS',
  },
  description: 'AI-powered task management, time blocking, nutrition tracking, and workout coaching — all in one place.',
  keywords: ['productivity', 'task management', 'WSJF', 'AI', 'nutrition', 'workout', 'time blocking'],
  metadataBase: new URL('https://lifeos.tr'),
  openGraph: {
    title: 'LifeOS — Your Personal Life OS',
    description: 'AI-powered productivity platform. Task management, time blocking, nutrition and workout tracking.',
    type: 'website',
    url: 'https://lifeos.tr',
    siteName: 'LifeOS',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LifeOS — Your Personal Life OS',
    description: 'AI-powered productivity platform.',
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning className={`${archivo.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans">
        <ErrorBoundary>
          <ToastProvider>{children}</ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
