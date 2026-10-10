'use client'

import { useEffect, useState } from 'react'
import { MotionConfig } from 'motion/react'
import { getTranslations, type Language } from '@/lib/i18n'
import { Closing } from '@/components/landing/Closing'
import { getLandingCopy } from '@/components/landing/copy'
import { DayBuilder } from '@/components/landing/DayBuilder'
import { Hero } from '@/components/landing/Hero'
import { LandingNav } from '@/components/landing/LandingNav'
import { MobileShowcase } from '@/components/landing/MobileShowcase'
import { MuscleMapShowcase } from '@/components/landing/MuscleMapShowcase'
import { Faq, Pricing, type Plan } from '@/components/landing/PricingFaq'
import { Reveal } from '@/components/landing/primitives'
import { WsjfPlayground } from '@/components/landing/WsjfPlayground'

const STORAGE_KEY = 'lifeos_lang'

export default function LandingPage() {
  // Varsayılan Türkçe: bu çeyrekte hedef pazar Türkiye ve gelen trafiğin
  // neredeyse tamamı TR. Kaydedilmiş tercih yoksa tarayıcı dili İngilizce
  // olanlar yine İngilizce görüyor.
  const [lang, setLangState] = useState<Language>('tr')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null
    if (stored === 'tr' || stored === 'en') { setLangState(stored); return }
    if (!navigator.language.toLowerCase().startsWith('tr')) setLangState('en')
  }, [])

  function toggleLang(l: Language) {
    setLangState(l)
    localStorage.setItem(STORAGE_KEY, l)
  }

  const t = getTranslations(lang)
  const copy = getLandingCopy(lang)

  const proFeatures = [
    t.pricing_current,
    t.feat_list_ai_nutrition,
    t.feat_list_ai_planning,
    t.feat_list_ai_wsjf,
    t.feat_list_ai_workout,
    t.feat_list_ai_parse,
    t.feat_list_support,
  ]
  const plans: Plan[] = [
    {
      name: t.pricing_free_name,
      price: '₺0',
      period: t.pricing_free_period,
      highlight: false,
      badge: null,
      features: [t.feat_list_tasks, t.feat_list_planning, t.feat_list_nutrition, t.feat_list_mobile, t.feat_list_reports],
      cta: t.pricing_free_cta,
      href: '/register',
    },
    {
      name: t.pricing_monthly_name,
      price: '₺99,90',
      period: `/ ${t.pricing_monthly_period}`,
      highlight: false,
      badge: null,
      features: proFeatures,
      cta: t.pricing_monthly_cta,
      href: '/register?plan=pro_monthly',
    },
    {
      name: t.pricing_annual_name,
      price: '₺790',
      period: `/ ${t.pricing_annual_period}`,
      highlight: true,
      badge: t.pricing_annual_badge,
      features: proFeatures,
      cta: t.pricing_annual_cta,
      href: '/register?plan=pro_annual',
    },
  ]

  const faqs = [
    { q: t.faq_1_q, a: t.faq_1_a },
    { q: t.faq_2_q, a: t.faq_2_a },
    { q: t.faq_3_q, a: t.faq_3_a },
    { q: t.faq_4_q, a: t.faq_4_a },
    { q: t.faq_5_q, a: t.faq_5_a },
  ]

  return (
    // Hareket, işletim sisteminde "hareketi azalt" açık olan ziyaretçide kapanır.
    <MotionConfig reducedMotion="user">
      <div className="landing-page-root isolate min-h-screen overflow-x-clip bg-[#080B14] font-sans text-white">
        <LandingNav
          lang={lang}
          onLang={toggleLang}
          labels={{ features: t.nav_features, pricing: t.nav_pricing, mobile: t.nav_mobile, login: t.nav_login, signup: t.nav_signup }}
        />

        <Hero
          badge={t.hero_badge}
          title1={t.hero_title_1}
          title2={t.hero_title_2}
          subtitle={t.hero_subtitle}
          cta={t.hero_cta_primary}
          note={t.hero_note}
          copy={copy}
        />

        {/* Bu şerit önce '10K+ Yönetilen Görev' diyordu; doğrulanamayan sayısal iddia
            hem Ticari Reklam Yönetmeliği'ne aykırı hem de güveni düşürüyor. Yerine
            itiraz karşılayan üç doğru bilgi: para istemiyoruz, Türkçe çalışıyor,
            iki cihazda aynı plan. */}
        <section className="border-y border-white/5 bg-white/[0.02] py-12">
          <div className="mx-auto grid max-w-4xl grid-cols-3 gap-6 px-6 text-center">
            {[
              { value: '₺0', label: t.stat_tasks },
              { value: 'Türkçe', label: t.stat_ai },
              { value: 'iOS + Web', label: t.stat_platforms },
            ].map(({ value, label }, i) => (
              <Reveal key={value} delay={i * 0.1} y={16}>
                <p className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-2xl font-black text-transparent md:text-4xl">{value}</p>
                <p className="mt-1.5 text-xs text-white/45 md:text-sm">{label}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <WsjfPlayground copy={copy} />
        <DayBuilder copy={copy} tr={lang === 'tr'} />
        <MuscleMapShowcase copy={copy} />
        <MobileShowcase t={t} />
        <Pricing eyebrow={t.nav_pricing} title={t.pricing_title} subtitle={t.pricing_subtitle} plans={plans} />
        <Faq title={t.faq_title} items={faqs} />
        <Closing t={t} />
      </div>
    </MotionConfig>
  )
}
