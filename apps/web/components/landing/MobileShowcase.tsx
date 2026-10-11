'use client'

import { useRef } from 'react'
import Image from 'next/image'
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { MagneticLink, Reveal, SectionHeading } from './primitives'

// App Store Connect kaydi: apps/mobile/eas.json -> submit.production.ios.ascAppId
const APP_STORE_URL = 'https://apps.apple.com/tr/app/lifeos/id6789708836'

interface MobileShowcaseProps {
  t: {
    mobile_eyebrow: string
    mobile_title: string
    mobile_subtitle: string
    mobile_point_1: string
    mobile_point_2: string
    mobile_point_3: string
    mobile_point_4: string
    mobile_appstore: string
    mobile_android_soon: string
    mobile_shot_tasks: string
    mobile_shot_nutrition: string
    mobile_shot_planning: string
  }
  tr: boolean
}

export function MobileShowcase({ t, tr }: MobileShowcaseProps) {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const ySide = useTransform(scrollYProgress, [0, 1], [90, -60])
  const yMid = useTransform(scrollYProgress, [0, 1], [30, -30])
  const spread = useTransform(scrollYProgress, [0.1, 0.45], [0, 1])
  const rotL = useTransform(spread, [0, 1], [0, -7])
  const rotR = useTransform(spread, [0, 1], [0, 7])

  const tiltX = useSpring(useMotionValue(0), { stiffness: 120, damping: 16 })
  const tiltY = useSpring(useMotionValue(0), { stiffness: 120, damping: 16 })
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce || e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    tiltY.set(((e.clientX - r.left) / r.width - 0.5) * 16)
    tiltX.set(-((e.clientY - r.top) / r.height - 0.5) * 10)
  }
  function onLeave() {
    tiltX.set(0)
    tiltY.set(0)
  }

  // Görsellerin başlığı ve içindeki uygulama ekranı dile göre değişir.
  const suffix = tr ? '' : '-en'
  const phones = [
    { src: `/mobile/tasks${suffix}.png`, alt: t.mobile_shot_tasks, y: ySide, rotate: rotL, cls: 'mt-10 w-1/3' },
    { src: `/mobile/nutrition${suffix}.png`, alt: t.mobile_shot_nutrition, y: yMid, rotate: undefined, cls: 'z-10 w-[38%]' },
    { src: `/mobile/planning${suffix}.png`, alt: t.mobile_shot_planning, y: ySide, rotate: rotR, cls: 'mt-10 w-1/3' },
  ]

  return (
    <section id="mobile" ref={ref} className="relative scroll-mt-24 overflow-hidden py-28">
      <div aria-hidden className="pointer-events-none absolute right-1/4 top-1/2 h-[520px] w-[520px] -translate-y-1/2 rounded-full bg-violet-600/12 blur-[130px]" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-6 lg:grid-cols-2">
        <div>
          <SectionHeading eyebrow={t.mobile_eyebrow} title={t.mobile_title} desc={t.mobile_subtitle} />
          <ul className="mb-10 mt-8 space-y-3">
            {[t.mobile_point_1, t.mobile_point_2, t.mobile_point_3, t.mobile_point_4].map((point, i) => (
              <Reveal key={point} delay={0.1 + i * 0.07} y={14}>
                <li className="flex items-start gap-3 text-sm text-white/65">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[11px] text-indigo-300">✓</span>
                  {point}
                </li>
              </Reveal>
            ))}
          </ul>

          <Reveal delay={0.35}>
            <div className="flex flex-wrap items-center gap-4">
              <MagneticLink href={APP_STORE_URL} external className="items-center gap-3 rounded-2xl bg-white px-5 py-3 font-semibold text-black transition hover:bg-white/90">
                <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.05 12.54c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.72-1.35-.14-2.64.79-3.33.79-.69 0-1.75-.77-2.87-.75-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.21 1.1-.04 1.51-.71 2.84-.71 1.33 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.3-.88-2.32-3.5zM14.9 5.9c.6-.74 1.01-1.75.9-2.77-.87.04-1.93.58-2.56 1.31-.56.65-1.05 1.69-.92 2.68.97.08 1.96-.49 2.58-1.22z" />
                </svg>
                <span className="flex flex-col leading-tight">
                  <span className="text-[10px] font-normal text-black/50">App Store</span>
                  <span className="text-sm">{t.mobile_appstore}</span>
                </span>
              </MagneticLink>
              {/* Play Store yayini henuz yok; olmayan magazaya link vermiyoruz. */}
              <span className="text-xs text-white/35">{t.mobile_android_soon}</span>
            </div>
          </Reveal>
        </div>

        <div className="[perspective:1600px]" onPointerMove={onMove} onPointerLeave={onLeave}>
          <motion.div style={{ rotateX: tiltX, rotateY: tiltY }} className="flex items-start justify-center gap-3 [transform-style:preserve-3d] sm:gap-4">
            {phones.map(({ src, alt, y, rotate, cls }) => (
              <motion.div
                key={src}
                style={reduce ? undefined : { y, rotate }}
                className={`overflow-hidden rounded-[22px] border border-white/10 bg-black shadow-2xl shadow-black/60 ${cls}`}
              >
                <Image src={src} alt={alt} width={430} height={932} sizes="(min-width: 1024px) 220px, 33vw" className="h-auto w-full" />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
