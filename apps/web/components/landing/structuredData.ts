import { getTranslations, type Language } from '@/lib/i18n'
import { APP_STORE_URL, GOOGLE_PLAY_URL, PRICE_TRY } from './copy'

const SITE_URL = 'https://lifeos.tr'

// Arama motoruna giden yapısal veri (JSON-LD). Metinler görünen sayfanın diliyle aynı olmalı:
// Google SSS yapısal verisini sayfada görünen soru ve cevaplarla karşılaştırır.
// Fiyat ve mağaza adresleri görünen sayfayla aynı kaynaktan.
// app/page.tsx'te değil burada: lib/i18n.ts @lifeos/shared üzerinden React hook'larını
// içe aktarıyor, sunucu bileşeninde derleme hatası veriyor.
export function buildLandingJsonLd(lang: Language): string {
  const t = getTranslations(lang)
  const inLanguage = lang === 'tr' ? 'tr-TR' : 'en-US'
  const faqs = [
    { q: t.faq_1_q, a: t.faq_1_a },
    { q: t.faq_2_q, a: t.faq_2_a },
    { q: t.faq_3_q, a: t.faq_3_a },
    { q: t.faq_4_q, a: t.faq_4_a },
    { q: t.faq_5_q, a: t.faq_5_a },
  ]
  const offer = (name: string, price: number) => ({
    '@type': 'Offer',
    name,
    price: price.toFixed(2),
    priceCurrency: 'TRY',
  })
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: 'LifeOS',
        inLanguage,
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${SITE_URL}/#app`,
        name: 'LifeOS',
        url: SITE_URL,
        description: t.hero_subtitle,
        applicationCategory: 'ProductivityApplication',
        operatingSystem: 'iOS, Android, Web',
        inLanguage,
        sameAs: [APP_STORE_URL, GOOGLE_PLAY_URL],
        offers: [
          offer(t.pricing_free_name, 0),
          offer(t.pricing_monthly_name, PRICE_TRY.monthly),
          offer(t.pricing_annual_name, PRICE_TRY.annual),
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        mainEntity: faqs.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  }
  // Metin içindeki "<" script etiketini kapatamasın.
  return JSON.stringify(graph).replace(/</g, '\\u003c')
}
