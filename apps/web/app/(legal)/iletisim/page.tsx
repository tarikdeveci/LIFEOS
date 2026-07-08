/* eslint-disable react/no-unescaped-entities */
import type { Metadata } from 'next'
import { company } from '@/lib/company'
import { LegalHeader, Section, Field } from '../_components'

export const metadata: Metadata = { title: 'İletişim' }

export default function IletisimPage() {
  const rows: { label: string; value: string }[] = [
    { label: 'Ticari Ünvan', value: company.legalName },
    { label: 'Merkez Ofis', value: company.address },
    { label: 'Mersin Şube', value: company.branchAddress },
    { label: 'Telefon', value: company.phone },
    { label: 'E-posta', value: company.email },
    { label: 'Vergi Dairesi', value: company.taxOffice },
    { label: 'Vergi Kimlik No', value: company.taxNumber },
    { label: 'Mersis No', value: company.mersisNo },
    { label: 'KEP Adresi', value: company.kepAddress },
  ].filter((r) => r.value.trim().length > 0)

  return (
    <>
      <LegalHeader
        title="İletişim"
        subtitle="Bize aşağıdaki kanallardan ulaşabilirsiniz. Talep ve şikayetleriniz en geç 14 gün içinde yanıtlanır."
      />

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
        <dl className="divide-y divide-white/[0.06]">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
              <dt className="w-48 shrink-0 text-sm font-semibold text-white/40">{r.label}</dt>
              <dd className="text-[15px]">
                <Field value={r.value} />
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <Section title="Müşteri Hizmetleri">
        <p>
          LifeOS ({company.brandName}) hizmetleri <strong className="text-white/80">{company.legalName}</strong>{' '}
          tarafından sunulmaktadır. Abonelik, ödeme, iptal ve iade işlemleriyle ilgili tüm sorularınız için
          yukarıdaki e-posta adresi üzerinden bize yazabilirsiniz.
        </p>
      </Section>
    </>
  )
}
