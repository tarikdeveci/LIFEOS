import type { Metadata } from 'next'
import { APP_STORE_ID } from '@/components/landing/copy'
import { LandingPage } from '@/components/landing/LandingPage'

// canonical sadece burada: kök layout'a konsaydı her alt sayfa kendini anasayfa ilan ederdi.
// itunes: iPhone Safari'de üstte "App Store'da aç" bandı.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  itunes: { appId: APP_STORE_ID },
}

export default function HomePage() {
  return <LandingPage />
}
