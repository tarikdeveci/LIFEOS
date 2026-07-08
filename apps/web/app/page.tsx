'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { getTranslations, type Language } from '@/lib/i18n'

const STORAGE_KEY = 'lifeos_lang'

export default function LandingPage() {
  const [lang, setLangState] = useState<Language>('en')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null
    if (stored === 'tr' || stored === 'en') setLangState(stored)
  }, [])

  function toggleLang(l: Language) {
    setLangState(l)
    localStorage.setItem(STORAGE_KEY, l)
  }

  const t = getTranslations(lang)

  const features = [
    { icon: '⚡', title: t.feat_wsjf_title, desc: t.feat_wsjf_desc, pro: false },
    { icon: '🗓️', title: t.feat_timeblocks_title, desc: t.feat_timeblocks_desc, pro: false },
    { icon: '🥗', title: t.feat_nutrition_title, desc: t.feat_nutrition_desc, pro: false },
    { icon: '🤖', title: t.feat_ai_nutrition_title, desc: t.feat_ai_nutrition_desc, pro: true },
    { icon: '✨', title: t.feat_ai_plan_title, desc: t.feat_ai_plan_desc, pro: true },
    { icon: '🎯', title: t.feat_ai_wsjf_title, desc: t.feat_ai_wsjf_desc, pro: true },
    { icon: '💪', title: t.feat_workout_title, desc: t.feat_workout_desc, pro: false },
    { icon: '📱', title: t.feat_mobile_title, desc: t.feat_mobile_desc, pro: false },
  ]

  const plans = [
    {
      name: t.pricing_free_name,
      price: '₺0',
      period: t.pricing_free_period,
      highlight: false,
      badge: null as string | null,
      features: [
        t.feat_list_tasks,
        t.feat_list_planning,
        t.feat_list_nutrition,
        t.feat_list_mobile,
        t.feat_list_reports,
      ],
      cta: t.pricing_free_cta,
      href: '/register',
    },
    {
      name: t.pricing_monthly_name,
      price: '₺99,90',
      period: `/ ${t.pricing_monthly_period}`,
      highlight: false,
      badge: null as string | null,
      features: [
        t.pricing_current,
        t.feat_list_ai_nutrition,
        t.feat_list_ai_planning,
        t.feat_list_ai_wsjf,
        t.feat_list_ai_workout,
        t.feat_list_ai_parse,
        t.feat_list_support,
      ],
      cta: t.pricing_monthly_cta,
      href: '/register?plan=pro_monthly',
    },
    {
      name: t.pricing_annual_name,
      price: '₺790',
      period: `/ ${t.pricing_annual_period}`,
      highlight: true,
      badge: t.pricing_annual_badge,
      features: [
        t.pricing_current,
        t.feat_list_ai_nutrition,
        t.feat_list_ai_planning,
        t.feat_list_ai_wsjf,
        t.feat_list_ai_workout,
        t.feat_list_ai_parse,
        t.feat_list_support,
      ],
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
    <div className="landing-page-root isolate min-h-screen bg-[#080B14] font-sans text-white">

      {/* ─── NAV ──────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#080B14]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="LifeOS" width={32} height={32} className="rounded-xl" />
            <span className="text-[17px] font-extrabold tracking-tight">
              Life<span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">OS</span>
            </span>
          </div>

          {/* Center links */}
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-white/60 transition hover:text-white">{t.nav_features}</a>
            <a href="#pricing" className="text-sm text-white/60 transition hover:text-white">{t.nav_pricing}</a>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5 text-xs font-semibold">
              <button
                onClick={() => toggleLang('en')}
                className={`px-3 py-1.5 transition ${lang === 'en' ? 'bg-indigo-600 text-white' : 'text-white/50 hover:text-white'}`}
              >
                EN
              </button>
              <button
                onClick={() => toggleLang('tr')}
                className={`px-3 py-1.5 transition ${lang === 'tr' ? 'bg-indigo-600 text-white' : 'text-white/50 hover:text-white'}`}
              >
                TR
              </button>
            </div>
            <Link href="/login" className="text-sm font-medium text-white/60 transition hover:text-white">
              {t.nav_login}
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              {t.nav_signup}
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pb-24 pt-20">
        {/* Background glow orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-indigo-600/20 blur-[120px]" />
          <div className="absolute -right-40 top-20 h-[500px] w-[500px] rounded-full bg-violet-600/15 blur-[120px]" />
          <div className="absolute bottom-0 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-5xl text-center">
          {/* Badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5">
            <span className="text-xs font-semibold text-indigo-300">{t.hero_badge}</span>
          </div>

          {/* Headline */}
          <h1 className="mb-6 text-5xl font-black leading-[1.08] tracking-tight md:text-7xl">
            <span className="text-white">{t.hero_title_1}</span>
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 bg-clip-text text-transparent">
              {t.hero_title_2}
            </span>
          </h1>

          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-white/50">
            {t.hero_subtitle}
          </p>

          {/* CTAs */}
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="group relative overflow-hidden rounded-2xl bg-indigo-600 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-500"
            >
              <span className="relative z-10">{t.hero_cta_primary} →</span>
            </Link>
            <a
              href="#features"
              className="rounded-2xl border border-white/10 bg-white/5 px-8 py-3.5 text-base font-semibold text-white/70 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              {t.hero_cta_secondary}
            </a>
          </div>
          <p className="mt-4 text-xs text-white/30">{t.hero_note}</p>
        </div>

        {/* ─── Dashboard Preview Mockup ─── */}
        <div className="relative mx-auto mt-16 max-w-5xl">
          {/* Glow behind mockup */}
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-indigo-600/20 to-transparent blur-3xl" />

          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0D1117] shadow-2xl shadow-black/50">
            {/* Fake browser bar */}
            <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.03] px-4 py-3">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
                <div className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
              </div>
              <div className="mx-auto flex h-5 w-56 items-center justify-center rounded-md bg-white/5 text-[10px] text-white/30">
                app.lifeos.tr/dashboard
              </div>
            </div>

            {/* Fake dashboard layout */}
            <div className="flex h-72 gap-0">
              {/* Sidebar */}
              <div className="w-40 shrink-0 border-r border-white/5 bg-white/[0.02] p-3">
                <div className="mb-4 flex items-center gap-1.5 px-1">
                  <div className="h-5 w-5 rounded-lg bg-indigo-600/80" />
                  <div className="h-2 w-12 rounded bg-white/20" />
                </div>
                {['Today', 'Tasks', 'Planning', 'Nutrition', 'Workout'].map((item, i) => (
                  <div
                    key={item}
                    className={`mb-0.5 flex items-center gap-2 rounded-xl px-2 py-1.5 ${i === 0 ? 'bg-indigo-600/20' : ''}`}
                  >
                    <div className={`h-2.5 w-2.5 rounded-sm ${i === 0 ? 'bg-indigo-400' : 'bg-white/20'}`} />
                    <div className={`h-1.5 rounded ${i === 0 ? 'w-10 bg-indigo-400/60' : 'w-10 bg-white/15'}`} />
                  </div>
                ))}
              </div>

              {/* Main content */}
              <div className="flex flex-1 gap-3 p-4">
                {/* Left column: Tasks */}
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-20 rounded bg-white/20" />
                  {[90, 70, 85, 60, 75].map((w, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.04] p-2.5">
                      <div className="h-3 w-3 shrink-0 rounded border border-white/20" />
                      <div className={`h-2 rounded bg-white/25`} style={{ width: `${w}%` }} />
                      <div className="ml-auto h-2 w-8 rounded bg-indigo-500/40" />
                    </div>
                  ))}
                </div>

                {/* Right column: Stats + Timeline */}
                <div className="w-48 space-y-2">
                  {/* Macro rings */}
                  <div className="rounded-xl border border-white/5 bg-white/[0.04] p-3">
                    <div className="mb-2 h-2 w-16 rounded bg-white/20" />
                    <div className="flex justify-around">
                      {([['#6366F1', 62], ['#8B5CF6', 49], ['#06B6D4', 53]] as [string, number][]).map(([color, dash], i) => (
                        <div key={i} className="flex flex-col items-center gap-1">
                          <div className="relative h-8 w-8">
                            <svg viewBox="0 0 32 32" className="h-8 w-8 -rotate-90">
                              <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
                              <circle
                                cx="16" cy="16" r="12" fill="none"
                                stroke={color} strokeWidth="3"
                                strokeDasharray={`${dash} 75.4`}
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>
                          <div className="h-1.5 w-4 rounded" style={{ background: color + '60' }} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="rounded-xl border border-white/5 bg-white/[0.04] p-3">
                    <div className="mb-2 h-2 w-14 rounded bg-white/20" />
                    {[['#6366F1', '09:00'], ['#8B5CF6', '10:30'], ['#06B6D4', '14:00']].map(([color, time], i) => (
                      <div key={i} className="mb-1.5 flex items-center gap-2">
                        <span className="text-[8px] text-white/30">{time}</span>
                        <div className="h-4 flex-1 rounded" style={{ background: color + '30', borderLeft: `2px solid ${color}` }} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── STATS ────────────────────────────────────────────────── */}
      <section className="border-y border-white/5 bg-white/[0.02] py-12">
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid grid-cols-3 gap-8 text-center">
            {[
              { value: '10K+', label: t.stat_tasks },
              { value: '7', label: t.stat_ai },
              { value: '2', label: t.stat_platforms },
            ].map(({ value, label }) => (
              <div key={label}>
                <p className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-4xl font-black text-transparent">
                  {value}
                </p>
                <p className="mt-1.5 text-sm text-white/40">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FEATURES ─────────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14 text-center">
          <h2 className="mb-3 text-4xl font-black tracking-tight text-white">
            {t.features_title}
          </h2>
          <p className="text-white/40">{t.features_subtitle}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 transition hover:border-indigo-500/30 hover:bg-white/[0.07]"
            >
              {/* Hover glow */}
              <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/10 to-transparent" />
              </div>

              {f.pro && (
                <span className="absolute right-3 top-3 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white">
                  Pro
                </span>
              )}
              <div className="mb-3 text-2xl">{f.icon}</div>
              <h3 className="mb-1.5 text-sm font-bold text-white">{f.title}</h3>
              <p className="text-xs leading-relaxed text-white/45">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-3 text-4xl font-black tracking-tight text-white">{t.how_title}</h2>
            <p className="text-white/40">{t.how_subtitle}</p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { step: '01', title: t.how_1_title, desc: t.how_1_desc, color: 'from-indigo-600 to-indigo-500' },
              { step: '02', title: t.how_2_title, desc: t.how_2_desc, color: 'from-violet-600 to-violet-500' },
              { step: '03', title: t.how_3_title, desc: t.how_3_desc, color: 'from-purple-600 to-purple-500' },
            ].map(({ step, title, desc, color }) => (
              <div key={step} className="relative rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6">
                <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-sm font-black text-white`}>
                  {step}
                </div>
                <h3 className="mb-2 text-base font-bold text-white">{title}</h3>
                <p className="text-sm leading-relaxed text-white/45">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING ──────────────────────────────────────────────── */}
      <section id="pricing" className="relative py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6">
          <div className="mb-14 text-center">
            <h2 className="mb-3 text-4xl font-black tracking-tight text-white">{t.pricing_title}</h2>
            <p className="text-white/40">{t.pricing_subtitle}</p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-6 transition ${
                  plan.highlight
                    ? 'border-indigo-500/60 bg-gradient-to-b from-indigo-950/80 to-[#080B14] shadow-xl shadow-indigo-500/20'
                    : 'border-white/[0.08] bg-white/[0.04]'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1 text-xs font-bold text-white">
                    {plan.badge}
                  </span>
                )}

                <div className="mb-5">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/40">{plan.name}</p>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-black text-white">{plan.price}</span>
                    <span className="mb-1 text-sm text-white/40">{plan.period}</span>
                  </div>
                </div>

                <ul className="mb-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-white/60">
                      <span className="mt-0.5 shrink-0 text-emerald-400">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className={`block rounded-xl py-2.5 text-center text-sm font-semibold transition ${
                    plan.highlight
                      ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                      : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-24">
        <h2 className="mb-10 text-center text-4xl font-black tracking-tight text-white">
          {t.faq_title}
        </h2>
        <div className="space-y-0 divide-y divide-white/[0.07]">
          {faqs.map(({ q, a }, i) => (
            <FaqItem key={i} q={q} a={a} />
          ))}
        </div>
      </section>

      {/* ─── CTA ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-28">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 via-violet-900/40 to-[#080B14]" />
          <div className="absolute left-1/4 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-indigo-600/25 blur-[80px]" />
          <div className="absolute right-1/4 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-violet-600/20 blur-[80px]" />
        </div>

        <div className="relative mx-auto max-w-2xl px-6 text-center">
          <Image src="/logo.png" alt="LifeOS" width={56} height={56} className="mx-auto mb-6 rounded-2xl shadow-lg shadow-indigo-500/30" />
          <h2 className="mb-4 text-4xl font-black tracking-tight text-white md:text-5xl">
            {t.cta_title}
          </h2>
          <p className="mb-8 text-white/50">{t.cta_subtitle}</p>
          <Link
            href="/register"
            className="inline-block rounded-2xl bg-white px-8 py-4 text-base font-bold text-indigo-600 shadow-xl shadow-black/30 transition hover:bg-indigo-50"
          >
            {t.cta_button}
          </Link>
        </div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-5 md:flex-row">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="LifeOS" width={24} height={24} className="rounded-lg" />
              <span className="text-sm font-bold text-white">
                Life<span className="text-indigo-400">OS</span>
              </span>
            </div>

            <div className="flex gap-6 text-xs text-white/30">
              <Link href="/login" className="transition hover:text-white">{t.nav_login}</Link>
              <Link href="/register" className="transition hover:text-white">{t.nav_signup}</Link>
              <a href="#features" className="transition hover:text-white">{t.nav_features}</a>
              <a href="#pricing" className="transition hover:text-white">{t.nav_pricing}</a>
            </div>

            <p className="text-xs text-white/20">© {new Date().getFullYear()} LifeOS. {t.footer_rights}</p>
          </div>

          {/* Yasal linkler (PayTR canlı mod gerekliliği) */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/[0.04] pt-6 text-xs text-white/30">
            <Link href="/iletisim" className="transition hover:text-white">İletişim</Link>
            <span className="text-white/10">·</span>
            <Link href="/mesafeli-satis-sozlesmesi" className="transition hover:text-white">Mesafeli Satış Sözleşmesi</Link>
            <span className="text-white/10">·</span>
            <Link href="/iptal-iade-kosullari" className="transition hover:text-white">İptal & İade Koşulları</Link>
            <span className="text-white/10">·</span>
            <Link href="/teslimat-kosullari" className="transition hover:text-white">Teslimat & Hizmet Koşulları</Link>
            <span className="text-white/10">·</span>
            <Link href="/gizlilik-kvkk" className="transition hover:text-white">Gizlilik & KVKK</Link>
          </div>

          <p className="mt-4 text-center text-xs text-white/20">
            Detay İnovasyon Çevre Eğitim ve Danışmanlık Hizmetleri Ltd. Şti.
          </p>
        </div>
      </footer>
    </div>
  )
}

// ─── FAQ Accordion ────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="py-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span className="text-sm font-semibold text-white/80">{q}</span>
        <span className={`shrink-0 text-white/30 transition-transform ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open && (
        <p className="mt-3 text-sm leading-relaxed text-white/40">{a}</p>
      )}
    </div>
  )
}
