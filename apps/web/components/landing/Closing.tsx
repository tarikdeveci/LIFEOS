'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion, useReducedMotion } from 'motion/react'
import { BLOCK_COLORS, MagneticLink, Reveal } from './primitives'

interface ClosingProps {
  t: {
    cta_title: string
    cta_subtitle: string
    cta_button: string
    nav_login: string
    nav_signup: string
    nav_features: string
    nav_pricing: string
    nav_mobile: string
    footer_rights: string
  }
}

// Logonun etrafında günün blok renkleri dönüyor: rutin, odak, öğün, antrenman.
const ORBITS = [
  { size: 150, dur: 14, color: BLOCK_COLORS.focus },
  { size: 210, dur: 22, color: BLOCK_COLORS.meal },
  { size: 270, dur: 30, color: BLOCK_COLORS.workout },
  { size: 330, dur: 40, color: BLOCK_COLORS.routine },
]

export function Closing({ t }: ClosingProps) {
  const reduce = useReducedMotion()
  return (
    <>
      <section className="relative overflow-hidden py-32">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-indigo-950/50 to-transparent" />
        <div className="relative mx-auto max-w-2xl px-6 text-center">
          <div className="relative mx-auto mb-10 flex h-[340px] w-[340px] max-w-full items-center justify-center">
            {ORBITS.map((o, i) => (
              <motion.div
                key={o.size}
                aria-hidden
                className="absolute rounded-full border border-white/[0.07]"
                style={{ width: o.size, height: o.size }}
                animate={reduce ? undefined : { rotate: i % 2 ? -360 : 360 }}
                transition={{ duration: o.dur, repeat: Infinity, ease: 'linear' }}
              >
                <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: o.color, boxShadow: `0 0 16px ${o.color}` }} />
              </motion.div>
            ))}
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 160, damping: 14 }}
              whileHover={{ rotate: -8, scale: 1.06 }}
            >
              <Image src="/logo.png" alt="LifeOS" width={88} height={88} className="rounded-3xl shadow-[0_0_60px_-6px_rgba(99,102,241,0.8)]" />
            </motion.div>
          </div>
          <Reveal>
            <h2 className="mb-4 text-4xl font-black tracking-tight text-white md:text-6xl">{t.cta_title}</h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="mb-9 text-white/55">{t.cta_subtitle}</p>
          </Reveal>
          <Reveal delay={0.16}>
            <MagneticLink href="/register" className="rounded-2xl bg-white px-8 py-4 text-base font-bold text-indigo-600 shadow-xl shadow-black/30 transition-colors hover:bg-indigo-50">
              {t.cta_button}
            </MagneticLink>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-white/[0.06] py-10">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-5 md:flex-row">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.png" alt="LifeOS" width={24} height={24} className="rounded-lg" />
              <span className="text-sm font-bold text-white">
                Life<span className="text-indigo-400">OS</span>
              </span>
            </div>
            <div className="flex flex-wrap justify-center gap-6 text-xs text-white/40">
              <Link href="/login" className="transition hover:text-white">{t.nav_login}</Link>
              <Link href="/register" className="transition hover:text-white">{t.nav_signup}</Link>
              <a href="#features" className="transition hover:text-white">{t.nav_features}</a>
              <a href="#pricing" className="transition hover:text-white">{t.nav_pricing}</a>
              <a href="#mobile" className="transition hover:text-white">{t.nav_mobile}</a>
            </div>
            <p className="text-xs text-white/30">© {new Date().getFullYear()} LifeOS. {t.footer_rights}</p>
          </div>

          {/* Yasal linkler (PayTR canlı mod gerekliliği) */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/[0.04] pt-6 text-xs text-white/40">
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
          <p className="mt-4 text-center text-xs text-white/30">Detay İnovasyon Çevre Eğitim ve Danışmanlık Hizmetleri Ltd. Şti.</p>
        </div>
      </footer>
    </>
  )
}
