'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { getTranslations, type Language } from '@/lib/i18n'

const STORAGE_KEY = 'lifeos_lang'

interface DayBlock {
  start: string
  end: string
  label: string
  kind: 'focus' | 'meal' | 'workout' | 'routine'
  now?: boolean
}

/**
 * Hero gorseli: temsili bir gun cetveli. Sahte tarayici penceresi ve gri
 * placeholder cubuklari yerine urunun kendi gorsel dili (zaman bloklari).
 */
function buildDayBlocks(t: ReturnType<typeof getTranslations>): DayBlock[] {
  return [
    { start: '07:00', end: '07:45', label: t.day_breakfast, kind: 'meal' },
    { start: '08:00', end: '10:30', label: t.day_focus, kind: 'focus', now: true },
    { start: '10:30', end: '11:00', label: t.day_break, kind: 'routine' },
    { start: '11:00', end: '12:30', label: t.day_review, kind: 'focus' },
    { start: '12:30', end: '13:15', label: t.day_lunch, kind: 'meal' },
    { start: '17:30', end: '18:30', label: t.day_training, kind: 'workout' },
  ]
}

const BLOCK_TONE: Record<DayBlock['kind'], string> = {
  focus: 'var(--signal)',
  meal: '#5FB89B',
  workout: '#D96A5A',
  routine: 'rgba(255,255,255,0.28)',
}

function DayStrip({ label, nowLabel, blocks }: { label: string; nowLabel: string; blocks: DayBlock[] }) {
  return (
    <div className="rounded-2xl border border-white/[0.09] bg-[#111112] p-5 sm:p-6">
      <div className="mb-5 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white/70">{label}</span>
        <span className="font-mono text-xs tabular-nums text-white/55">07:00 &ndash; 19:00</span>
      </div>

      <ol className="space-y-2.5">
        {blocks.map((block, i) => (
          <li
            key={block.start}
            className="day-block flex items-center gap-3.5"
            style={{ '--i': i } as React.CSSProperties}
          >
            <span className="w-11 shrink-0 font-mono text-[11px] tabular-nums text-white/55">
              {block.start}
            </span>
            <span
              className="h-8 shrink-0 rounded-[5px]"
              style={{
                width: block.now ? '3px' : '3px',
                background: BLOCK_TONE[block.kind],
                opacity: block.kind === 'routine' ? 0.5 : 1,
              }}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-white/70">{block.label}</span>
            {block.now && (
              <span className="shrink-0 rounded-full bg-[var(--signal)]/15 px-2.5 py-0.5 text-[11px] font-bold text-[var(--signal)]">
                {nowLabel}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

// App Store Connect kaydi: apps/mobile/eas.json -> submit.production.ios.ascAppId
const APP_STORE_URL = 'https://apps.apple.com/tr/app/lifeos/id6789708836'

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
    <div className="landing-page-root brand-surface isolate min-h-screen font-sans">

      {/* ─── NAV ──────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0B0B0C]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="LifeOS" width={32} height={32} className="rounded-xl" />
            <span className="text-[17px] font-extrabold tracking-tight">
              Life<span className="text-[var(--signal)]">OS</span>
            </span>
          </div>

          {/* Center links */}
          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-white/60 transition hover:text-white">{t.nav_features}</a>
            <a href="#pricing" className="text-sm text-white/60 transition hover:text-white">{t.nav_pricing}</a>
            <a href="#mobile" className="text-sm text-white/60 transition hover:text-white">{t.nav_mobile}</a>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <div className="flex overflow-hidden rounded-lg border border-white/10 bg-white/5 text-xs font-semibold">
              <button
                onClick={() => toggleLang('en')}
                className={`px-3 py-1.5 transition ${lang === 'en' ? 'bg-[var(--signal)] text-[#17150F]' : 'text-white/55 hover:text-white'}`}
              >
                EN
              </button>
              <button
                onClick={() => toggleLang('tr')}
                className={`px-3 py-1.5 transition ${lang === 'tr' ? 'bg-[var(--signal)] text-[#17150F]' : 'text-white/55 hover:text-white'}`}
              >
                TR
              </button>
            </div>
            <Link href="/login" className="text-sm font-medium text-white/60 transition hover:text-white">
              {t.nav_login}
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-[var(--signal)] px-4 py-2 text-sm font-semibold text-[#17150F] transition-colors hover:bg-[var(--signal-bright)]"
            >
              {t.nav_signup}
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Sinyal serit: gunun "simdi" cizgisi. Dekoratif blur yerine urunun
            kendi mantigi (triyaj) tasiyor. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-[var(--signal)]/40 to-transparent sm:left-6" />

        <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:pt-24">
          {/* Sol alan: tipografi */}
          <div className="max-w-xl">
            <p className="mb-6 flex items-center gap-2.5 text-sm text-white/55">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--signal)]" />
              {t.hero_badge}
            </p>

            <h1 className="mb-6 text-balance text-[clamp(2.6rem,6.4vw,4.75rem)] font-extrabold leading-[1.04] tracking-[-0.03em] text-white">
              {t.hero_title_1}{' '}
              <span className="text-[var(--signal)]">{t.hero_title_2}</span>
            </h1>

            <p className="mb-9 max-w-[52ch] text-pretty text-lg leading-relaxed text-white/60">
              {t.hero_subtitle}
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-xl bg-[var(--signal)] px-7 py-3.5 text-base font-bold text-[#17150F] transition-colors hover:bg-[var(--signal-bright)]"
              >
                {t.hero_cta_primary}
              </Link>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-7 py-3.5 text-base font-semibold text-white/80 transition-colors hover:border-white/35 hover:text-white"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.05 12.54c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.72-1.35-.14-2.64.79-3.33.79-.69 0-1.75-.77-2.87-.75-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.21 1.1-.04 1.51-.71 2.84-.71 1.33 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.3-.88-2.32-3.5zM14.9 5.9c.6-.74 1.01-1.75.9-2.77-.87.04-1.93.58-2.56 1.31-.56.65-1.05 1.69-.92 2.68.97.08 1.96-.49 2.58-1.22z" />
                </svg>
                {t.hero_cta_secondary}
              </a>
            </div>

            <p className="mt-5 text-sm text-white/55">{t.hero_note}</p>
          </div>

          {/* Sag alan: gunun kendisi. Sahte tarayici penceresi ve gri cubuklar
              yerine gercek bir zaman cetveli + gercek uygulama ekrani. */}
          <div className="relative">
            <DayStrip label={t.hero_day_label} nowLabel={t.hero_now} blocks={buildDayBlocks(t)} />

            <div className="pointer-events-none absolute -bottom-6 -right-2 w-[38%] max-w-[190px] overflow-hidden rounded-[1.25rem] shadow-2xl shadow-black/70 sm:-right-4 sm:w-[34%] lg:-right-8">
              <Image
                src="/mobile/planning.png"
                alt={t.hero_shot_alt}
                width={430}
                height={932}
                priority
                className="h-auto w-full"
              />
            </div>
          </div>
        </div>
      </section>

      {/* NE OLDUGU */}
      <section className="border-y border-white/[0.07]">
        <div className="mx-auto grid max-w-7xl gap-px bg-white/[0.07] px-6 sm:grid-cols-3">
          {[
            { k: t.pillar_1_title, v: t.pillar_1_desc },
            { k: t.pillar_2_title, v: t.pillar_2_desc },
            { k: t.pillar_3_title, v: t.pillar_3_desc },
          ].map(({ k, v }) => (
            <div key={k} className="bg-[#0B0B0C] px-1 py-9 sm:px-7">
              <h3 className="mb-2 text-base font-bold text-white">{k}</h3>
              <p className="max-w-[38ch] text-sm leading-relaxed text-white/55">{v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── FEATURES ─────────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14 text-center">
          <h2 className="mb-3 text-4xl font-black tracking-tight text-white">
            {t.features_title}
          </h2>
          <p className="text-white/55">{t.features_subtitle}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] p-5 transition hover:border-[var(--signal)]/40 hover:bg-white/[0.07]"
            >
              {/* Hover glow */}
              <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100">
                
              </div>

              {f.pro && (
                <span className="absolute right-3 top-3 rounded-full bg-[var(--signal)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#17150F]">
                  Pro
                </span>
              )}
              <div className="mb-3 text-2xl">{f.icon}</div>
              <h3 className="mb-1.5 text-sm font-bold text-white">{f.title}</h3>
              <p className="text-xs leading-relaxed text-white/55">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-3 text-4xl font-black tracking-tight text-white">{t.how_title}</h2>
            <p className="text-white/55">{t.how_subtitle}</p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              { step: '01', title: t.how_1_title, desc: t.how_1_desc, tone: 'var(--signal)' },
              { step: '02', title: t.how_2_title, desc: t.how_2_desc, tone: '#5FB89B' },
              { step: '03', title: t.how_3_title, desc: t.how_3_desc, tone: '#D96A5A' },
            ].map(({ step, title, desc, tone }) => (
              <div key={step} className="relative rounded-xl border border-white/[0.08] bg-white/[0.03] p-6">
                <div
                  className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg font-mono text-sm font-bold tabular-nums text-[#17150F]"
                  style={{ background: tone }}
                >
                  {step}
                </div>
                <h3 className="mb-2 text-base font-bold text-white">{title}</h3>
                <p className="text-sm leading-relaxed text-white/55">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING ──────────────────────────────────────────────── */}
      {/* MOBILE APP */}
      <section id="mobile" className="relative overflow-hidden py-24">
        <div className="pointer-events-none absolute inset-0">
          
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-6 lg:grid-cols-2">
          <div>
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/60">
              {t.mobile_eyebrow}
            </span>
            <h2 className="mb-4 text-4xl font-black tracking-tight text-white">{t.mobile_title}</h2>
            <p className="mb-8 leading-relaxed text-white/55">{t.mobile_subtitle}</p>

            <ul className="mb-9 space-y-3">
              {[t.mobile_point_1, t.mobile_point_2, t.mobile_point_3, t.mobile_point_4].map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm text-white/60">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--signal)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {point}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-4">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 rounded-2xl bg-white px-5 py-3 font-semibold text-black transition hover:bg-white/90"
              >
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.05 12.54c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.72-1.35-.14-2.64.79-3.33.79-.69 0-1.75-.77-2.87-.75-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.21 1.1-.04 1.51-.71 2.84-.71 1.33 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.3-.88-2.32-3.5zM14.9 5.9c.6-.74 1.01-1.75.9-2.77-.87.04-1.93.58-2.56 1.31-.56.65-1.05 1.69-.92 2.68.97.08 1.96-.49 2.58-1.22z" />
                </svg>
                <span className="flex flex-col leading-tight">
                  <span className="text-[10px] font-normal text-black/65">App Store</span>
                  <span className="text-sm">{t.mobile_appstore}</span>
                </span>
              </a>

              {/* Play Store yayini henuz yok; olmayan magazaya link vermiyoruz. */}
              <span className="text-xs text-white/55">{t.mobile_android_soon}</span>
            </div>
          </div>

          {/* Uygulama ekranlari - ortadaki one cikar */}
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            {[
              { src: '/mobile/tasks.png', alt: t.mobile_shot_tasks, cls: 'mt-8 w-1/3 rotate-[-4deg]' },
              { src: '/mobile/nutrition.png', alt: t.mobile_shot_nutrition, cls: 'z-10 w-2/5' },
              { src: '/mobile/planning.png', alt: t.mobile_shot_planning, cls: 'mt-8 w-1/3 rotate-[4deg]' },
            ].map(({ src, alt, cls }) => (
              <div key={src} className={`overflow-hidden rounded-2xl shadow-2xl shadow-black/60 ${cls}`}>
                <Image src={src} alt={alt} width={430} height={932} className="h-auto w-full" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="relative py-24">
        <div className="pointer-events-none absolute inset-0">
          
        </div>

        <div className="relative mx-auto max-w-5xl px-6">
          <div className="mb-14 text-center">
            <h2 className="mb-3 text-4xl font-black tracking-tight text-white">{t.pricing_title}</h2>
            <p className="text-white/55">{t.pricing_subtitle}</p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-6 transition ${
                  plan.highlight
                    ? 'border-[var(--signal)]/50 bg-white/[0.05]'
                    : 'border-white/[0.08] bg-white/[0.04]'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--signal)] px-3 py-1 text-xs font-bold text-[#17150F]">
                    {plan.badge}
                  </span>
                )}

                <div className="mb-5">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/55">{plan.name}</p>
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-black text-white">{plan.price}</span>
                    <span className="mb-1 text-sm text-white/55">{plan.period}</span>
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
                      ? 'bg-[var(--signal)] text-[#17150F] hover:bg-[var(--signal-bright)]'
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
          
          
          
        </div>

        <div className="relative mx-auto max-w-2xl px-6 text-center">
          <Image src="/logo.png" alt="LifeOS" width={56} height={56} className="mx-auto mb-6 rounded-2xl shadow-lg shadow-black/40" />
          <h2 className="mb-4 text-4xl font-black tracking-tight text-white md:text-5xl">
            {t.cta_title}
          </h2>
          <p className="mb-8 text-white/55">{t.cta_subtitle}</p>
          <Link
            href="/register"
            className="inline-block rounded-xl bg-[var(--signal)] px-8 py-4 text-base font-bold text-[#17150F] transition-colors hover:bg-[var(--signal-bright)]"
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
                Life<span className="text-[var(--signal)]">OS</span>
              </span>
            </div>

            <div className="flex gap-6 text-xs text-white/55">
              <Link href="/login" className="transition hover:text-white">{t.nav_login}</Link>
              <Link href="/register" className="transition hover:text-white">{t.nav_signup}</Link>
              <a href="#features" className="transition hover:text-white">{t.nav_features}</a>
              <a href="#pricing" className="transition hover:text-white">{t.nav_pricing}</a>
              <a href="#mobile" className="transition hover:text-white">{t.nav_mobile}</a>
            </div>

            <p className="text-xs text-white/55">© {new Date().getFullYear()} LifeOS. {t.footer_rights}</p>
          </div>

          {/* Yasal linkler (PayTR canlı mod gerekliliği) */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/[0.04] pt-6 text-xs text-white/55">
            <Link href="/iletisim" className="transition hover:text-white">İletişim</Link>
            <span aria-hidden="true" className="text-white/30">·</span>
            <Link href="/mesafeli-satis-sozlesmesi" className="transition hover:text-white">Mesafeli Satış Sözleşmesi</Link>
            <span aria-hidden="true" className="text-white/30">·</span>
            <Link href="/iptal-iade-kosullari" className="transition hover:text-white">İptal & İade Koşulları</Link>
            <span aria-hidden="true" className="text-white/30">·</span>
            <Link href="/teslimat-kosullari" className="transition hover:text-white">Teslimat & Hizmet Koşulları</Link>
            <span aria-hidden="true" className="text-white/30">·</span>
            <Link href="/gizlilik-kvkk" className="transition hover:text-white">Gizlilik & KVKK</Link>
          </div>

          <p className="mt-4 text-center text-xs text-white/55">
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
        <span className={`shrink-0 text-white/55 transition-transform ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open && (
        <p className="mt-3 text-sm leading-relaxed text-white/55">{a}</p>
      )}
    </div>
  )
}
