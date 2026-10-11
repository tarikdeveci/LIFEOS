'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import type { LandingCopy } from './copy'
import { Reveal, SectionHeading } from './primitives'

const CYCLE_MS = 4500

// Görseller uygulamanın gerçek ekranından kırpıldı (yalnız kas haritası kartı),
// kaynak: marketing/promo-film-15s/screens/kas-*.png. İngilizce sayfa, uygulamanın
// İngilizce arayüzünden çekilmiş -en kopyalarını gösterir (Front/Back, Ready...).
export function MuscleMapShowcase({ copy, tr }: { copy: LandingCopy; tr: boolean }) {
  const tabs = copy.muscle_tabs
  const [idx, setIdx] = useState(1)
  const [auto, setAuto] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { amount: 0.4 })
  const reduce = useReducedMotion()

  // Görünürken modlar kendiliğinden döner; ziyaretçi bir sekmeye dokununca durur.
  useEffect(() => {
    if (!auto || !inView || reduce) return
    const id = setTimeout(() => setIdx((i) => (i + 1) % tabs.length), CYCLE_MS)
    return () => clearTimeout(id)
  }, [auto, inView, reduce, idx, tabs.length])

  const rx = useSpring(useMotionValue(0), { stiffness: 150, damping: 18 })
  const ry = useSpring(useMotionValue(0), { stiffness: 150, damping: 18 })
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce || e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 12)
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 10)
  }
  function onLeave() {
    rx.set(0)
    ry.set(0)
  }

  const tab = tabs[idx] ?? tabs[0]
  if (!tab) return null

  return (
    <section className="relative overflow-hidden py-28">
      <div aria-hidden className="pointer-events-none absolute left-1/3 top-1/2 h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
      <div ref={ref} className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 lg:grid-cols-2">
        <div>
          <SectionHeading eyebrow={copy.muscle_eyebrow} title={copy.muscle_title} desc={copy.muscle_desc} />

          <Reveal delay={0.2} className="mt-10">
            <div role="tablist" className="inline-flex rounded-2xl border border-white/10 bg-white/[0.04] p-1">
              {tabs.map((t, i) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={i === idx}
                  onClick={() => {
                    setIdx(i)
                    setAuto(false)
                  }}
                  className={`relative overflow-hidden rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${i === idx ? 'text-white' : 'text-white/50 hover:text-white/80'}`}
                >
                  {i === idx && (
                    <motion.span layoutId="muscle-tab" className="absolute inset-0 rounded-xl bg-white/10 ring-1 ring-white/15" transition={{ type: 'spring', stiffness: 380, damping: 30 }} />
                  )}
                  <span className="relative">{t.label}</span>
                  {i === idx && auto && inView && !reduce && (
                    <motion.span
                      key={`bar-${idx}`}
                      className="absolute bottom-0 left-0 h-0.5 bg-emerald-400"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: CYCLE_MS / 1000, ease: 'linear' }}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="mt-5 min-h-[4.5rem] max-w-md">
              <AnimatePresence mode="wait">
                <motion.p key={tab.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }} className="leading-relaxed text-white/60">
                  {tab.desc}
                </motion.p>
              </AnimatePresence>
            </div>
            <span className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              ✓ {copy.muscle_free}
            </span>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="[perspective:1400px]" onPointerMove={onMove} onPointerLeave={onLeave}>
            <motion.div
              style={{ rotateX: rx, rotateY: ry }}
              className="relative mx-auto max-w-[520px] overflow-hidden rounded-[28px] bg-white p-3 shadow-[0_40px_120px_-30px_rgba(16,185,129,0.35)] md:p-5"
            >
              <div className="relative aspect-[684/789]">
                <AnimatePresence initial={false}>
                  <motion.div
                    key={tab.key}
                    initial={{ opacity: 0, scale: 1.03, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.55 }}
                    className="absolute inset-0"
                  >
                    <Image src={`/landing/muscle-${tab.key}${tr ? '' : '-en'}.webp`} alt={`${copy.muscle_alt}: ${tab.label}`} fill sizes="(min-width: 1024px) 520px, 90vw" className="object-contain object-top" />
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
