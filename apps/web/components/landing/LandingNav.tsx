'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, useMotionValueEvent, useScroll, useSpring } from 'motion/react'
import type { Language } from '@/lib/i18n'

interface LandingNavProps {
  lang: Language
  onLang: (l: Language) => void
  labels: { features: string; pricing: string; mobile: string; login: string; signup: string }
}

export function LandingNav({ lang, onLang, labels }: LandingNavProps) {
  const { scrollY, scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30 })
  const [hidden, setHidden] = useState(false)
  const [solid, setSolid] = useState(false)

  // Aşağı inerken menü çekilir, yukarı dönünce geri gelir: okurken içerik önde.
  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0
    setHidden(y > prev && y > 240)
    setSolid(y > 24)
  })

  return (
    <motion.nav
      animate={{ y: hidden ? '-110%' : '0%' }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${
        solid ? 'border-white/[0.06] bg-[#080B14]/75 backdrop-blur-xl' : 'border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <motion.span whileHover={{ rotate: -12, scale: 1.08 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }}>
            <Image src="/logo.png" alt="LifeOS" width={32} height={32} className="rounded-xl" priority />
          </motion.span>
          <span className="text-[17px] font-extrabold tracking-tight">
            Life<span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">OS</span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {[
            ['#features', labels.features],
            ['#mobile', labels.mobile],
            ['#pricing', labels.pricing],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-1.5 text-sm text-white/60 transition hover:bg-white/5 hover:text-white">
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs font-semibold" role="group" aria-label="Language">
            {(['en', 'tr'] as const).map((l) => (
              <button
                key={l}
                onClick={() => onLang(l)}
                aria-pressed={lang === l}
                className={`relative px-2.5 py-1 transition-colors ${lang === l ? 'text-white' : 'text-white/50 hover:text-white'}`}
              >
                {lang === l && (
                  <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-md bg-indigo-600" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                )}
                <span className="relative">{l.toUpperCase()}</span>
              </button>
            ))}
          </div>
          <Link href="/login" className="hidden text-sm font-medium text-white/60 transition hover:text-white sm:inline">
            {labels.login}
          </Link>
          <Link href="/register" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500">
            {labels.signup}
          </Link>
        </div>
      </div>
      <motion.div style={{ scaleX: progress }} className="h-px origin-left bg-gradient-to-r from-indigo-500 via-violet-400 to-cyan-300" />
    </motion.nav>
  )
}
