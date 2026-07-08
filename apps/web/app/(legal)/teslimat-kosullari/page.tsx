/* eslint-disable react/no-unescaped-entities */
import type { Metadata } from 'next'
import { company } from '@/lib/company'
import { LegalHeader, Section, Field } from '../_components'

export const metadata: Metadata = { title: 'Teslimat & Hizmet Koşulları' }

export default function TeslimatPage() {
  return (
    <>
      <LegalHeader
        title="Teslimat & Hizmet Koşulları"
        subtitle="LifeOS dijital bir yazılım hizmetidir; fiziksel ürün gönderimi yoktur."
      />

      <Section title="Hizmetin Niteliği">
        <p>
          LifeOS, {company.legalName} tarafından sunulan bulut tabanlı bir yazılım (SaaS) hizmetidir.
          Satın alınan abonelik dijital olarak sağlanır; kargo veya fiziksel teslimat söz konusu değildir.
        </p>
      </Section>

      <Section title="Teslimat / Erişim Süresi">
        <p>
          Ödemeniz PayTR üzerinden onaylandığı <strong className="text-white/80">anda</strong>, satın aldığınız
          plana ait tüm özellikler hesabınıza otomatik olarak tanımlanır. Herhangi bir bekleme süresi yoktur.
        </p>
        <p>
          Web tarayıcısı ({company.website}) ve mobil uygulama üzerinden internet bağlantısı olan her
          cihazdan hizmete erişebilirsiniz.
        </p>
      </Section>

      <Section title="Erişim Sorunları">
        <p>
          Ödemeniz başarıyla tamamlandığı halde hizmete erişemiyorsanız, lütfen{' '}
          <Field value={company.email} /> adresinden bizimle iletişime geçin. Erişim sorunları en kısa
          sürede giderilir; giderilemezse ilgili dönem ücreti iade edilir.
        </p>
      </Section>

      <Section title="Sistem Gereksinimleri">
        <ul className="ml-4 list-disc space-y-1">
          <li>Güncel bir web tarayıcısı (Chrome, Safari, Edge, Firefox)</li>
          <li>iOS / Android mobil uygulama (opsiyonel)</li>
          <li>Aktif internet bağlantısı</li>
        </ul>
      </Section>
    </>
  )
}
