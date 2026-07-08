/**
 * Firma / satıcı bilgileri — yasal sayfalarda (İletişim, Mesafeli Satış
 * Sözleşmesi, İptal & İade, Teslimat, Gizlilik/KVKK) tek kaynak olarak kullanılır.
 *
 * Bilgiler 2025 tarihli vergi levhası + detayinovasyon.com'dan alınmıştır.
 * Boş bırakılan alanlar (mersisNo, kepAddress) sayfalarda otomatik gizlenir.
 */

export const company = {
  // Ticari ünvan (vergi levhası)
  legalName: 'Detay İnovasyon Çevre Eğitim ve Danışmanlık Hizmetleri Limited Şirketi',
  brandName: 'LifeOS',
  website: 'https://lifeos.tr',

  // Resmi bilgiler
  address:
    'Sarıköprü Mah. Ömer Halisdemir Küme Evler Teknopark, Teknopark No: 31 İç Kapı No: 116 Merkez / Niğde',
  branchAddress:
    'Limonluk Mah. 2415 Sk. Semt Yeniköy Muhlis Tamam Blokları B Blok Yenişehir / Mersin',
  phone: '+90 530 848 46 68',
  email: 'info@detayinovasyon.com',
  taxOffice: 'Niğde Vergi Dairesi',
  taxNumber: '2931054975',
  mersisNo: '', // elde yok — doldurulursa ilgili sayfalarda otomatik gösterilir
  kepAddress: '', // varsa doldur

  // Ürün / hizmet bilgisi (dijital abonelik)
  serviceName: 'LifeOS Pro Aboneliği (dijital yazılım hizmeti)',
  plans: [
    { name: 'Aylık Pro', price: '₺99,90', period: 'ay' },
    { name: 'Yıllık Pro', price: '₺790', period: 'yıl' },
  ],

  // İade politikası — dijital hizmet
  refundDays: 14,

  lastUpdated: '2026-07-07',
} as const

export type Company = typeof company
