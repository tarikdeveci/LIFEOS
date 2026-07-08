/* eslint-disable react/no-unescaped-entities */
import type { Metadata } from 'next'
import { company } from '@/lib/company'
import { LegalHeader, Section, Field } from '../_components'

export const metadata: Metadata = { title: 'İptal & İade Koşulları' }

export default function IptalIadePage() {
  return (
    <>
      <LegalHeader
        title="İptal & İade Koşulları"
        subtitle="LifeOS dijital abonelik hizmetine ilişkin iptal, cayma ve iade koşulları."
      />

      <Section title="Aboneliğin İptali">
        <p>
          Aboneliğinizi dilediğiniz zaman hesap ayarlarınızdaki <strong className="text-white/80">Faturalandırma</strong>{' '}
          bölümünden veya <Field value={company.email} /> adresine e-posta göndererek iptal edebilirsiniz.
        </p>
        <p>
          İptal ettiğinizde mevcut ödenmiş dönem sonuna kadar hizmetten yararlanmaya devam edersiniz;
          takip eden dönem için ücret tahsil edilmez ve otomatik yenileme durdurulur.
        </p>
      </Section>

      <Section title="Cayma Hakkı ve İade">
        <p>
          Hizmeti satın aldıktan sonra <strong className="text-white/80">{company.refundDays} gün</strong>{' '}
          içinde cayma hakkınızı kullanabilirsiniz. Bu süre içinde talep ettiğinizde ödemeniz koşulsuz
          iade edilir.
        </p>
        <p>
          Yasal istisna: Mesafeli Sözleşmeler Yönetmeliği m.15 uyarınca, onayınızla ifasına başlanan ve
          elektronik ortamda anında ifa edilen hizmetlerde, hizmet tam olarak ifa edilmişse cayma hakkı
          kullanılamaz. Buna rağmen mağduriyet yaşadığınızı düşünüyorsanız bizimle iletişime geçin;
          talebinizi iyi niyetle değerlendiririz.
        </p>
      </Section>

      <Section title="İade Süreci ve Süresi">
        <ul className="ml-4 list-disc space-y-2">
          <li>İade talebi <Field value={company.email} /> adresine iletilir.</li>
          <li>Talebiniz en geç <strong className="text-white/80">14 gün</strong> içinde sonuçlandırılır.</li>
          <li>
            İade, ödemede kullandığınız karta yapılır. Bankanıza bağlı olarak kartınıza yansıma süresi
            değişebilir.
          </li>
          <li>İade tutarında herhangi bir kesinti yapılmaz.</li>
        </ul>
      </Section>

      <Section title="İletişim">
        <p>
          İptal ve iade işlemleriyle ilgili tüm sorularınız için:{' '}
          <a href="/iletisim" className="text-indigo-400 hover:underline">İletişim sayfası</a> ·{' '}
          <Field value={company.email} />
        </p>
      </Section>
    </>
  )
}
