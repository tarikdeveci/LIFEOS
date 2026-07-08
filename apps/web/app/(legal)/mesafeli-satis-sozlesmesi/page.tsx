/* eslint-disable react/no-unescaped-entities */
import type { Metadata } from 'next'
import { company } from '@/lib/company'
import { LegalHeader, Section, Field } from '../_components'

export const metadata: Metadata = { title: 'Mesafeli Satış Sözleşmesi' }

export default function MesafeliSatisPage() {
  return (
    <>
      <LegalHeader
        title="Mesafeli Satış Sözleşmesi"
        subtitle="6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği kapsamında düzenlenmiştir."
      />

      <Section title="1. Taraflar">
        <p>
          İşbu sözleşme, aşağıda bilgileri yer alan SATICI ile hizmeti satın alan ALICI arasında,
          elektronik ortamda kurulmuştur.
        </p>
        <p><strong className="text-white/80">SATICI</strong></p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Ünvan: {company.legalName}</li>
          <li>Adres: <Field value={company.address} /></li>
          <li>Telefon: <Field value={company.phone} /></li>
          <li>E-posta: <Field value={company.email} /></li>
          <li>Vergi Dairesi / No: <Field value={`${company.taxOffice} — ${company.taxNumber}`} /></li>
          {company.mersisNo && <li>Mersis No: <Field value={company.mersisNo} /></li>}
        </ul>
        <p className="mt-3">
          <strong className="text-white/80">ALICI</strong>: Hizmeti satın almak için kayıt ve ödeme
          işlemini gerçekleştiren, bilgileri sistemde kayıtlı kullanıcı.
        </p>
      </Section>

      <Section title="2. Sözleşmenin Konusu">
        <p>
          İşbu sözleşmenin konusu, ALICI'nın {company.website} internet sitesi üzerinden elektronik
          ortamda siparişini verdiği, aşağıda nitelikleri ve satış fiyatı belirtilen dijital yazılım
          hizmetinin (<strong className="text-white/80">{company.serviceName}</strong>) satışı ve ifasıyla
          ilgili tarafların hak ve yükümlülüklerinin belirlenmesidir.
        </p>
      </Section>

      <Section title="3. Hizmet ve Ödeme Bilgileri">
        <div className="overflow-hidden rounded-xl border border-white/[0.08]">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-white/50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Hizmet</th>
                <th className="px-4 py-2 text-left font-semibold">Dönem</th>
                <th className="px-4 py-2 text-right font-semibold">Fiyat (KDV dahil)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {company.plans.map((p) => (
                <tr key={p.name}>
                  <td className="px-4 py-2.5">{p.name}</td>
                  <td className="px-4 py-2.5 text-white/50">{p.period}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-white/80">{p.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Ödeme, PayTR altyapısı üzerinden kredi/banka kartı ile güvenli şekilde tahsil edilir. SATICI,
          kart bilgilerini görmez ve saklamaz.
        </p>
      </Section>

      <Section title="4. Hizmetin İfası (Teslimat)">
        <p>
          Hizmet dijitaldir. Ödeme onaylandığı anda ALICI'nın hesabına ilgili özellikler tanımlanır ve
          hizmete anında erişim sağlanır. Fiziksel teslimat söz konusu değildir. Detaylar için{' '}
          <a href="/teslimat-kosullari" className="text-indigo-400 hover:underline">Teslimat & Hizmet Koşulları</a>{' '}
          sayfasına bakınız.
        </p>
      </Section>

      <Section title="5. Cayma Hakkı">
        <p>
          ALICI, hizmetin ifasına başlanmasından itibaren {company.refundDays} gün içinde herhangi bir
          gerekçe göstermeksizin cayma hakkına sahiptir. Ancak Mesafeli Sözleşmeler Yönetmeliği'nin 15.
          maddesi uyarınca, ALICI'nın onayı ile ifasına başlanan ve elektronik ortamda anında ifa edilen
          hizmetlerde, ifa tamamlandıktan sonra cayma hakkı kullanılamaz.
        </p>
        <p>
          Cayma ve iade süreçlerinin ayrıntıları için{' '}
          <a href="/iptal-iade-kosullari" className="text-indigo-400 hover:underline">İptal & İade Koşulları</a>{' '}
          sayfasını inceleyiniz. Cayma bildirimi <Field value={company.email} /> adresine yapılır.
        </p>
      </Section>

      <Section title="6. Genel Hükümler">
        <p>
          ALICI, sözleşme konusu hizmetin temel nitelikleri, satış fiyatı ve ödeme şekli ile ifaya ilişkin
          ön bilgileri okuyup bilgi sahibi olduğunu ve elektronik ortamda gerekli teyidi verdiğini kabul eder.
        </p>
        <p>
          Taraflar arasında doğabilecek uyuşmazlıklarda, Ticaret Bakanlığı'nca ilan edilen değere kadar
          ALICI'nın yerleşim yerindeki Tüketici Hakem Heyetleri, bu değeri aşan durumlarda Tüketici
          Mahkemeleri yetkilidir.
        </p>
      </Section>
    </>
  )
}
