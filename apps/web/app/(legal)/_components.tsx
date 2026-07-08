import { company } from '@/lib/company'

export function LegalHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-10">
      <h1 className="text-3xl font-black tracking-tight md:text-4xl">{title}</h1>
      {subtitle && <p className="mt-3 text-white/50">{subtitle}</p>}
      <p className="mt-4 text-xs text-white/30">Son güncelleme: {company.lastUpdated}</p>
    </header>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-bold text-white">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-white/60">{children}</div>
    </section>
  )
}

/** Placeholder alanları görsel olarak işaretler (DOLDUR ile başlayanlar sarı vurgulu). */
export function Field({ value }: { value: string }) {
  const isPlaceholder = value.startsWith('DOLDUR')
  return (
    <span className={isPlaceholder ? 'rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-300' : 'text-white/80'}>
      {value}
    </span>
  )
}
