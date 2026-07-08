import Link from 'next/link'
import Image from 'next/image'

const legalLinks = [
  { href: '/iletisim', label: 'İletişim' },
  { href: '/mesafeli-satis-sozlesmesi', label: 'Mesafeli Satış Sözleşmesi' },
  { href: '/iptal-iade-kosullari', label: 'İptal & İade Koşulları' },
  { href: '/teslimat-kosullari', label: 'Teslimat & Hizmet Koşulları' },
  { href: '/gizlilik-kvkk', label: 'Gizlilik & KVKK' },
]

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080B14] font-sans text-white">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#080B14]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="LifeOS" width={32} height={32} className="rounded-xl" />
            <span className="text-[17px] font-extrabold tracking-tight">
              Life<span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">OS</span>
            </span>
          </Link>
          <Link href="/" className="text-sm text-white/60 transition hover:text-white">
            ← Ana sayfa
          </Link>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-16">
        {children}

        {/* Cross links */}
        <div className="mt-16 border-t border-white/[0.08] pt-8">
          <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">
            Yasal sayfalar
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {legalLinks.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm text-white/50 transition hover:text-indigo-400">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-xs text-white/20">
            © {new Date().getFullYear()} Detay İnovasyon Çevre Eğitim ve Danışmanlık Hizmetleri Ltd. Şti. — LifeOS. Tüm hakları saklıdır.
          </p>
        </div>
      </footer>
    </div>
  )
}
