'use client'

import { useRef, useState } from 'react'
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'
import type { BlockType, LandingCopy } from './copy'
import { BLOCK_COLORS } from './primitives'

// Sahne ölçüsü: saat 09:00-19:00, yüzde cinsinden konum. Sol sütun görev havuzu,
// sağ sütun günün takvimi. Kaydırma ilerlemesi (0-1) üç adıma bölünür:
// 0-0.3 sırala, 0.3-0.66 yerleştir, 0.66-1 kayınca yeniden kur.
const START = 9
const SPAN = 10
const SHIFT = 0.5 // saat: toplantı 30 dk uzuyor
const POOL = { left: 0, width: 34 }
const CAL = { left: 42, width: 58 }
const y = (h: number) => ((h - START) / SPAN) * 100
const toPct = (n: number) => `${n}%`

interface SceneItem {
  label: string
  type: BlockType
  from: number
  to: number
  /** Havuzdaki sırası; yoksa blok baştan takvimde (toplantı, öğle, antrenman). */
  pool?: number
  /** Toplantı: üçüncü adımda uzayan blok. */
  grows?: boolean
}

function items(tr: boolean): SceneItem[] {
  return [
    { label: tr ? 'Vergi beyannamesi' : 'Tax return', type: 'focus', from: 9, to: 10, pool: 0 },
    { label: tr ? 'Ekip toplantısı' : 'Team meeting', type: 'task', from: 10.5, to: 11.5, grows: true },
    { label: tr ? 'Doktor randevusu' : 'Doctor visit', type: 'task', from: 11.5, to: 12, pool: 1 },
    { label: tr ? 'Öğle yemeği' : 'Lunch', type: 'meal', from: 12.5, to: 13.5 },
    { label: tr ? 'Sunum slaytları' : 'Slide deck', type: 'focus', from: 13.5, to: 15, pool: 2 },
    { label: tr ? 'Mutfak dolabı' : 'Kitchen cabinet', type: 'routine', from: 15.5, to: 16.5, pool: 3 },
    { label: tr ? 'Antrenman' : 'Workout', type: 'workout', from: 17, to: 18 },
  ]
}

export function DayBuilder({ copy, tr }: { copy: LandingCopy; tr: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] })
  const done = useMotionValue(1)
  const p = reduce ? done : scrollYProgress
  const [step, setStep] = useState(reduce ? 2 : 0)

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    if (!reduce) setStep(v < 0.3 ? 0 : v < 0.66 ? 1 : 2)
  })

  const lateOpacity = useTransform(p, [0.68, 0.74], [0, 1])
  const shiftedOpacity = useTransform(p, [0.86, 0.92], [0, 1])

  return (
    <section ref={ref} className={`relative ${reduce ? '' : 'h-[320vh]'}`}>
      <div className={`${reduce ? 'py-24' : 'sticky top-0 h-screen'} flex items-center overflow-hidden`}>
        <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14">
          <div>
            <span className="mb-4 inline-block font-mono text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300/80">{copy.build_eyebrow}</span>
            <ol className="space-y-2 lg:space-y-5">
              {copy.build_steps.map((s, i) => {
                const on = i === step
                return (
                  <li key={s.title} className={`${on ? '' : 'hidden lg:block'}`}>
                    <motion.div animate={{ opacity: on ? 1 : 0.3, x: on ? 0 : -6 }} transition={{ duration: 0.4 }} className="flex gap-4">
                      <span className="relative mt-1 h-auto w-1 shrink-0 overflow-hidden rounded-full bg-white/10">
                        <motion.span className="absolute inset-x-0 top-0 bg-indigo-400" animate={{ height: on ? '100%' : '0%' }} transition={{ duration: 0.5 }} />
                      </span>
                      <span>
                        <span className="block text-2xl font-black tracking-tight text-white md:text-4xl">{s.title}</span>
                        <span className="mt-2 block max-w-md text-sm leading-relaxed text-white/55 md:text-base">{s.desc}</span>
                      </span>
                    </motion.div>
                  </li>
                )
              })}
            </ol>
          </div>

          <div className="relative h-[52vh] min-h-[360px] rounded-3xl border border-white/10 bg-[#0D1220]/80 p-4 shadow-2xl shadow-indigo-950/50 md:h-[64vh] md:p-6">
            <div className="relative h-full">
              <p className="absolute -top-1 left-0 text-[11px] font-semibold uppercase tracking-widest text-white/35" style={{ width: `${POOL.width}%` }}>
                {copy.build_pool}
              </p>
              {/* takvim saat çizgileri */}
              {Array.from({ length: SPAN + 1 }, (_, i) => (
                <div key={i} className="absolute border-t border-white/[0.06]" style={{ top: `${y(START + i)}%`, left: `${CAL.left - 6}%`, right: 0 }}>
                  <span className="absolute -top-2 left-0 font-mono text-[10px] text-white/30">{String(START + i).padStart(2, '0')}</span>
                </div>
              ))}
              {items(tr).map((it) => (
                <Block key={it.label} it={it} p={p} />
              ))}

              <motion.div
                style={{ opacity: lateOpacity, top: `${y(11.25)}%` }}
                className="absolute right-2 z-10 -translate-y-1/2 rounded-lg bg-rose-500/90 px-2 py-1 text-[11px] font-bold text-white shadow-lg"
              >
                {copy.build_late}
              </motion.div>
              <motion.div style={{ opacity: shiftedOpacity }} className="absolute bottom-0 right-2 z-10 flex items-center gap-1.5 rounded-lg bg-emerald-500/90 px-2 py-1 text-[11px] font-bold text-white shadow-lg">
                ✓ {copy.build_shifted}
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Block({ it, p }: { it: SceneItem; p: MotionValue<number> }) {
  const color = BLOCK_COLORS[it.type]
  const inPool = it.pool !== undefined
  const k = it.pool ?? 0
  const calTop = y(it.from)
  const calH = y(it.to) - y(it.from)
  const shift = it.grows ? 0 : it.from >= 11.5 ? (SHIFT / SPAN) * 100 : 0

  // havuz: sıra numarasına göre üst üste; takvim: saatine göre
  const poolTop = 6 + k * 15
  const appear = 0.04 + k * 0.05
  const f0 = 0.33 + k * 0.07
  const f1 = 0.45 + k * 0.07
  const s0 = 0.74 + k * 0.02
  const s1 = 0.84 + k * 0.02
  const grown = calH + (SHIFT / SPAN) * 100

  const top = useTrack(p, inPool
    ? [[0, poolTop], [f0, poolTop], [f1, calTop], [s0, calTop], [s1, calTop + shift]]
    : [[0, calTop], [s0, calTop], [s1, calTop + shift]])
  const left = useTrack(p, inPool ? [[f0, POOL.left], [f1, CAL.left]] : [[0, CAL.left], [1, CAL.left]])
  const width = useTrack(p, inPool ? [[f0, POOL.width], [f1, CAL.width]] : [[0, CAL.width], [1, CAL.width]])
  const height = useTrack(p, it.grows
    ? [[0.7, calH], [0.76, grown]]
    : inPool ? [[f0, 12], [f1, calH]] : [[0, calH], [1, calH]])
  const opacity = useTrack(p, inPool ? [[appear - 0.04, 0], [appear, 1]] : [[0, 1], [1, 1]])
  const rotate = useTrack(p, inPool ? [[f0, 0], [(f0 + f1) / 2, -4], [f1, 0]] : [[0, 0], [1, 0]])

  const style = {
    top: useTransform(top, toPct),
    left: useTransform(left, toPct),
    width: useTransform(width, toPct),
    height: useTransform(height, toPct),
    opacity,
    rotate,
  }

  return (
    <motion.div
      style={{ ...style, background: `${color}22`, borderLeft: `3px solid ${color}` }}
      className="absolute flex items-center overflow-hidden rounded-lg px-2.5 backdrop-blur-sm"
    >
      <span className="truncate text-[11px] font-semibold text-white/90 md:text-xs">{it.label}</span>
    </motion.div>
  )
}

/** [ilerleme, değer] çiftlerinden kaydırmaya bağlı değer; aralık dışında uçtaki değerde kalır. */
function useTrack(p: MotionValue<number>, frames: readonly (readonly [number, number])[]) {
  return useTransform(p, frames.map((f) => f[0]), frames.map((f) => f[1]))
}
