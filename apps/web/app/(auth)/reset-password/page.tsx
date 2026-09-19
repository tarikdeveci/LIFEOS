import type { Metadata } from 'next'
import { ResetPasswordForm } from './ResetPasswordForm'

export const metadata: Metadata = { title: 'Yeni Şifre' }

// Build sırasında statik üretilmez: form tarayıcı Supabase istemcisini modül
// seviyesinde kuruyor ve env'i olmayan ortamda (Vercel preview) build düşüyor.
export const dynamic = 'force-dynamic'

// Oturum gerektirir: sıfırlama bağlantısı /auth/callback'te oturuma çevrilip
// buraya yönlenir. Oturumsuz gelen middleware tarafından girişe atılır.
export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-primary">Yeni şifre belirle</h1>
        <p className="mt-1 text-sm text-muted">Hesabın için yeni bir şifre seç.</p>
        <div className="mt-6">
          <ResetPasswordForm />
        </div>
      </div>
    </div>
  )
}
