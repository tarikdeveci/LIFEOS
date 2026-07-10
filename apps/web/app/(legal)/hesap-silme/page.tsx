import type { Metadata } from 'next'

import { company } from '@/lib/company'

import { Field, LegalHeader, Section } from '../_components'

export const metadata: Metadata = {
  title: 'LifeOS Hesap ve Veri Silme',
  description: 'LifeOS hesabınızı ve ilişkili verilerinizi kalıcı olarak silme adımları.',
}

export default function HesapSilmePage() {
  return (
    <>
      <LegalHeader title="LifeOS Hesap ve Veri Silme" subtitle="Hesabınızı ve LifeOS ile ilişkilendirilmiş kişisel verilerinizi kalıcı olarak silebilirsiniz." />
      <Section title="Uygulama içinden silme">
        <ol className="ml-5 list-decimal space-y-2">
          <li>LifeOS mobil uygulamasında hesabınıza giriş yapın.</li>
          <li><strong className="text-white/80">Profil</strong> sekmesini açın.</li>
          <li><strong className="text-white/80">Hesap ve Gizlilik</strong> bölümüne gidin.</li>
          <li><strong className="text-red-300">Hesabı kalıcı olarak sil</strong> seçeneğine dokunun ve iki aşamalı onayı tamamlayın.</li>
        </ol>
      </Section>
      <Section title="Uygulamaya erişemiyorsanız">
        <p>Kayıtlı e-posta adresinizden <Field value={company.email} /> adresine “LifeOS hesap silme talebi” başlığıyla e-posta gönderin. Güvenliğiniz için hesap sahipliğini doğrulamamız gerekebilir.</p>
      </Section>
      <Section title="Silinen veriler">
        <p>Hesap silindiğinde profiliniz, görevleriniz, planlarınız, zaman bloklarınız, beslenme ve antrenman kayıtlarınız, bildirim tercihleriniz ve abonelik eşleştirmeleriniz silinir.</p>
        <p>Yasal yükümlülükler nedeniyle saklanması zorunlu fatura veya işlem kayıtları yalnızca ilgili mevzuatta belirtilen süre boyunca ayrı ve kısıtlı biçimde tutulabilir.</p>
      </Section>
      <Section title="İşlem süresi">
        <p>Uygulama içinden yapılan silme işlemi hemen başlatılır. E-posta ile iletilen talepler kimlik doğrulamasının ardından en geç 30 gün içinde sonuçlandırılır.</p>
      </Section>
    </>
  )
}
