import type { Metadata } from 'next'
import LoginForm from './LoginForm'

export const metadata: Metadata = { title: 'Giriş Yap' }

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      {/* Sol panel — Branding */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-[#1A1A2E] via-[#16213E] to-[#0F3460] lg:flex lg:flex-col lg:items-center lg:justify-center">
        {/* Dekoratif daireler */}
        <div className="absolute -left-20 -top-20 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-accent/8 blur-3xl" />
        <div className="absolute left-1/3 top-1/4 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl" />

        <div className="z-10 max-w-sm text-center">
          <div className="mb-6 inline-flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] bg-white/10 backdrop-blur-sm">
            <img src="/logo.png" alt="LifeOS" width={96} height={96} className="h-full w-full object-cover" loading="eager" />
          </div>
          <h2 className="text-3xl font-bold text-white">
            Life<span className="text-accent">OS</span>
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            Görevlerini akıllıca önceliklendir, günlerini planla, 
            beslenmeni takip et — hepsi tek bir yerde.
          </p>

          {/* Feature badges */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {[
              { label: 'WSJF Önceliklendirme' },
              { label: 'Zaman Planlama' },
              { label: 'Beslenme Takibi' },
              { label: 'Mobil Uygulama' },
            ].map((f) => (
              <span
                key={f.label}
                className="inline-flex items-center rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-sm"
              >
                {f.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Sağ panel — Form */}
      <div className="flex flex-1 items-center justify-center bg-background px-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 text-center lg:hidden">
            <div className="mb-3 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-accent/10">
              <img src="/logo.png" alt="LifeOS" width={64} height={64} className="h-full w-full object-cover" loading="eager" />
            </div>
            <h1 className="text-2xl font-bold text-primary">
              Life<span className="text-accent">OS</span>
            </h1>
          </div>

          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold text-primary">Hoş Geldiniz</h1>
            <p className="mt-1 text-sm text-muted">Giriş yapın veya yeni hesap oluşturun</p>
          </div>

          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </div>
    </div>
  )
}
