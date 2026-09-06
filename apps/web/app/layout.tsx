import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { ToastProvider } from '@/components/ui/Toast'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

// Sayfa Türkçe (html lang="tr") ama başlık ve açıklama İngilizce ve eski
// konumlandırmadaydı ("her şeyi yapan uygulama"). Arama sonucunda ve paylaşım
// kartında görünen metin bu; hedef pazar Türkiye olduğu sürece Türkçe ve
// hero ile aynı vaadi söylemeli.
export const metadata: Metadata = {
  title: {
    default: 'LifeOS — Gününü kuran yapay zekâ planlayıcı',
    template: '%s | LifeOS',
  },
  description: 'Yapılacaklar listen zaten var. LifeOS görevlerini WSJF ile sıralar, takvimine yerleştirir, gün içinde kayınca yeniden planlar. Öğün ve antrenman da aynı planın içinde.',
  keywords: ['gün planlayıcı', 'zaman bloğu', 'görev takibi', 'görev yönetimi', 'yapay zeka koç', 'kişisel asistan', 'hedef takibi', 'öğün takibi'],
  metadataBase: new URL('https://lifeos.tr'),
  openGraph: {
    title: 'LifeOS — Gününü kuran yapay zekâ planlayıcı',
    description: 'Görevlerini WSJF ile sıralar, takvimine yerleştirir, gün içinde kayınca yeniden planlar.',
    type: 'website',
    url: 'https://lifeos.tr',
    siteName: 'LifeOS',
    locale: 'tr_TR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LifeOS — Gününü kuran yapay zekâ planlayıcı',
    description: 'Görevlerini WSJF ile sıralar, takvimine yerleştirir, gün içinde kayınca yeniden planlar.',
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans">
        <ErrorBoundary>
          <ToastProvider>{children}</ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
