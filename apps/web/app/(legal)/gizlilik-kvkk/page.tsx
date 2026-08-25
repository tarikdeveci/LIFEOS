/* eslint-disable react/no-unescaped-entities */
import type { Metadata } from 'next'
import { company } from '@/lib/company'
import { LegalHeader, Section, Field } from '../_components'

export const metadata: Metadata = { title: 'Gizlilik Politikası & KVKK' }

export default function GizlilikKvkkPage() {
  return (
    <>
      <LegalHeader
        title="Gizlilik Politikası & KVKK Aydınlatma Metni"
        subtitle="6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında hazırlanmıştır."
      />

      <Section title="1. Veri Sorumlusu">
        <p>
          Kişisel verileriniz, veri sorumlusu sıfatıyla <strong className="text-white/80">{company.legalName}</strong>{' '}
          tarafından aşağıda açıklanan kapsamda işlenmektedir.
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Adres: <Field value={company.address} /></li>
          <li>E-posta: <Field value={company.email} /></li>
        </ul>
      </Section>

      <Section title="2. İşlenen Kişisel Veriler">
        <ul className="ml-4 list-disc space-y-1">
          <li><strong className="text-white/80">Kimlik & İletişim:</strong> ad-soyad, e-posta adresi</li>
          <li><strong className="text-white/80">Kullanım verileri:</strong> görevler, planlar, beslenme ve antrenman kayıtları</li>
          <li><strong className="text-white/80">Sağlık ve fitness verileri:</strong> açık izninizle Apple Health veya Health Connect üzerinden alınan adım, mesafe, aktif enerji, egzersiz, antrenman, uyku ve nabız özetleri</li>
          <li><strong className="text-white/80">İşlem verileri:</strong> abonelik durumu, ödeme işlem kayıtları</li>
          <li><strong className="text-white/80">Teknik veriler:</strong> IP adresi, cihaz ve tarayıcı bilgileri, çerezler</li>
        </ul>
        <p>
          Kart bilgileri tarafımızca <strong className="text-white/80">görülmez ve saklanmaz</strong>; ödeme
          işlemleri PCI-DSS uyumlu PayTR altyapısı üzerinden gerçekleştirilir.
        </p>
      </Section>

      <Section title="3. İşleme Amaçları">
        <ul className="ml-4 list-disc space-y-1">
          <li>Hizmetin sunulması, hesabınızın oluşturulması ve yönetilmesi</li>
          <li>Abonelik ve ödeme işlemlerinin yürütülmesi</li>
          <li>Müşteri destek taleplerinin karşılanması</li>
          <li>Yasal yükümlülüklerin yerine getirilmesi ve hizmet güvenliğinin sağlanması</li>
        </ul>
      </Section>

      <Section title="4. Verilerin Aktarımı">
        <p>
          Verileriniz yalnızca hizmetin sunulması için gerekli olan hizmet sağlayıcılarla paylaşılır:
          ödeme altyapısı (PayTR), bulut altyapı sağlayıcısı (Supabase) ve yapay zeka özelliklerinin
          çalışması için ilgili işleme hizmetleri. Bu aktarımlar KVKK m.8 ve m.9'a uygun şekilde yapılır.
        </p>
      </Section>

      <Section title="5. Apple Health ve Health Connect Verileri">
        <p>
          LifeOS, sağlık verilerine yalnızca siz bağlantıyı başlattığınızda ve sistem izin ekranından onay verdiğinizde
          erişir. Erişim salt okunurdur; LifeOS, Apple Health veya Health Connect üzerine sağlık verisi yazmaz.
        </p>
        <p>
          Ham sağlık örnekleri cihazınızda kalır. LifeOS; günlük sağlık özeti, hedef ilerlemesi, aktiviteye göre kalori
          bütçesi, haftalık içgörüler ve toparlanma sinyalleri sunabilmek için yalnızca günlük toplulaştırılmış değerleri
          hesabınızla ilişkili olarak Supabase altyapısında saklar. Bu veriler reklam, pazarlama veya veri satışı amacıyla
          kullanılmaz ve hesabınızı sildiğinizde diğer hesap verilerinizle birlikte silinir.
        </p>
      </Section>

      <Section title="6. Çerezler (Cookies)">
        <p>
          Site, oturum yönetimi ve temel işlevsellik için gerekli çerezleri kullanır. Tarayıcı
          ayarlarınızdan çerezleri yönetebilirsiniz; ancak zorunlu çerezler devre dışı bırakıldığında
          hizmet düzgün çalışmayabilir.
        </p>
      </Section>

      <Section title="7. Haklarınız (KVKK m.11)">
        <p>Kişisel verilerinize ilişkin olarak aşağıdaki haklara sahipsiniz:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li>Verilerinizin işlenip işlenmediğini öğrenme ve bilgi talep etme</li>
          <li>İşlenme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenme</li>
          <li>Eksik/yanlış işlenmişse düzeltilmesini isteme</li>
          <li>Silinmesini veya yok edilmesini isteme</li>
          <li>İşlemenin sınırlanmasını ve zararın giderilmesini talep etme</li>
        </ul>
        <p>
          Taleplerinizi <Field value={company.email} /> adresine iletebilirsiniz. Başvurularınız en geç
          30 gün içinde sonuçlandırılır.
        </p>
      </Section>
      <Section title="8. Hesap ve Veri Silme">
        <p>
          LifeOS hesabınızı mobil uygulamadaki <strong className="text-white/80">Profil → Hesap ve Gizlilik</strong>{' '}
          bölümünden kalıcı olarak silebilirsiniz. Uygulamaya erişemiyorsanız{' '}
          <a href="/hesap-silme" className="font-semibold text-indigo-300 hover:text-indigo-200">hesap silme sayfasındaki</a>{' '}
          alternatif başvuru yolunu kullanabilirsiniz.
        </p>
      </Section>
    </>
  )
}
