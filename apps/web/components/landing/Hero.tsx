'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import type { LandingCopy } from './copy'
import { BLOCK_COLORS, EASE_OUT, MagneticLink } from './primitives'

interface HeroProps {
  badge: string
  title1: string
  title2: string
  subtitle: string
  cta: string
  note: string
  copy: LandingCopy
}

const DAY_START = 6 * 60
const DAY_END = 23 * 60
// Örnek gün: cetveldeki bloklar copy.ruler_blocks ile aynı sırada.
const BLOCK_TIMES: readonly [number, number][] = [
  [7 * 60, 7 * 60 + 45],
  [9 * 60, 11 * 60],
  [11 * 60 + 30, 12 * 60 + 15],
  [12 * 60 + 30, 13 * 60 + 15],
  [14 * 60, 15 * 60],
  [18 * 60, 19 * 60],
  [19 * 60 + 30, 20 * 60 + 15],
]

const pct = (m: number) => ((m - DAY_START) / (DAY_END - DAY_START)) * 100
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

export function Hero({ badge, title1, title2, subtitle, cta, note, copy }: HeroProps) {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const mx = useMotionValue(-1000)
  const my = useMotionValue(-1000)
  const spotlight = useMotionTemplate`radial-gradient(520px circle at ${mx}px ${my}px, rgba(129,140,248,0.16), transparent 65%)`

  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const rulerScale = useTransform(scrollYProgress, [0, 1], [1, 0.9])
  const rulerY = useTransform(scrollYProgress, [0, 1], [0, 120])
  const titleY = useTransform(scrollYProgress, [0, 1], [0, -80])
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0])

  function onMove(e: React.PointerEvent) {
    if (reduce || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    mx.set(e.clientX - r.left)
    my.set(e.clientY - r.top)
  }

  const words1 = title1.split(' ')
  const words2 = title2.split(' ')

  return (
    <section ref={ref} onPointerMove={onMove} className="relative overflow-hidden px-6 pb-28 pt-36 md:pt-44">
      {/* Saat çizgileri zemini: ürünün kendi görsel dili, gün cetveli */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]"
        style={{ backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px)', backgroundSize: '64px 100%' }}
      />
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-indigo-600/20 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute -right-40 top-24 h-[460px] w-[460px] rounded-full bg-violet-600/15 blur-[120px]" />
      <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: spotlight }} />

      <motion.div style={reduce ? undefined : { y: titleY, opacity: fade }} className="relative mx-auto max-w-5xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
          className="mb-7 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-indigo-400" />
          </span>
          <span className="text-xs font-semibold text-indigo-200">{badge}</span>
        </motion.div>

        <h1 className="mb-7 text-balance text-5xl font-black leading-[1.04] tracking-tight md:text-7xl">
          <span className="block text-white">
            {words1.map((w, i) => (
              <motion.span
                key={`${w}-${i}`}
                className="mr-[0.25em] inline-block"
                initial={{ opacity: 0, y: 40, rotateX: -60, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.8, delay: 0.1 + i * 0.06, ease: EASE_OUT }}
              >
                {w}
              </motion.span>
            ))}
          </span>
          <span className="block">
            {words2.map((w, i) => (
              <motion.span
                key={`${w}-${i}`}
                className="mr-[0.25em] inline-block bg-gradient-to-r from-indigo-300 via-violet-300 to-cyan-200 bg-[length:200%_100%] bg-clip-text text-transparent"
                initial={{ opacity: 0, y: 40, rotateX: -60, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, rotateX: 0, filter: 'blur(0px)', backgroundPosition: ['0% 0%', '100% 0%', '0% 0%'] }}
                transition={{
                  default: { duration: 0.8, delay: 0.4 + i * 0.07, ease: EASE_OUT },
                  backgroundPosition: { duration: 8, repeat: Infinity, ease: 'linear' },
                }}
              >
                {w}
              </motion.span>
            ))}
          </span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.8, ease: EASE_OUT }}
          className="mx-auto mb-10 max-w-2xl text-pretty text-lg leading-relaxed text-white/55"
        >
          {subtitle}
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.95, ease: EASE_OUT }}>
          <MagneticLink
            href="/register"
            className="group relative items-center gap-2 overflow-hidden rounded-2xl bg-indigo-600 px-8 py-4 text-base font-bold text-white shadow-[0_0_40px_-8px_rgba(99,102,241,0.8)] transition-colors hover:bg-indigo-500"
          >
            <span className="relative z-10">{cta}</span>
            <span className="relative z-10 transition-transform group-hover:translate-x-1">→</span>
            <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </MagneticLink>
          <p className="mt-4 text-xs text-white/35">{note}</p>
        </motion.div>
      </motion.div>

      <motion.div
        style={reduce ? undefined : { scale: rulerScale, y: rulerY }}
        initial={{ opacity: 0, rotateX: 28, y: 80 }}
        animate={{ opacity: 1, rotateX: 0, y: 0 }}
        transition={{ duration: 1.1, delay: 0.9, ease: EASE_OUT }}
        className="relative mx-auto mt-20 max-w-5xl [perspective:1200px]"
      >
        <DayRuler copy={copy} />
      </motion.div>

      <motion.a
        href="#features"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="relative mx-auto mt-14 flex w-fit flex-col items-center gap-2 text-xs text-white/35 transition hover:text-white/70"
      >
        {copy.hero_scroll}
        <motion.span animate={reduce ? undefined : { y: [0, 6, 0] }} transition={{ duration: 1.6, repeat: Infinity }} aria-hidden>
          ↓
        </motion.span>
      </motion.a>
    </section>
  )
}

/** Günün tamamı tek şeritte; "şimdi" çizgisi ziyaretçinin gerçek saatinde durur. */
function DayRuler({ copy }: { copy: LandingCopy }) {
  const [now, setNow] = useState<number | null>(null)
  const [active, setActive] = useState<number | null>(null)

  // Saat sunucuda değil tarayıcıda okunur; yoksa sayfa sunucu saatiyle (UTC) gelir.
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setNow(d.getHours() * 60 + d.getMinutes())
    }
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  const blocks = copy.ruler_blocks.flatMap((b, i) => {
    const time = BLOCK_TIMES[i]
    return time ? [{ ...b, s: time[0], e: time[1] }] : []
  })
  const nowPct = now === null ? null : Math.min(100, Math.max(0, pct(now)))
  const current = now === null ? -1 : blocks.findIndex((b) => now >= b.s && now < b.e)
  const shownBlock = blocks[active ?? current]
  const hours = Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => DAY_START + i * 60)

  return (
    <div className="relative rounded-3xl border border-white/10 bg-[#0D1220]/80 p-5 shadow-2xl shadow-indigo-950/60 backdrop-blur md:p-7">
      <div aria-hidden className="absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />
      <div className="mb-5 flex items-center justify-between">
        <span className="text-sm font-bold text-white/80">{copy.ruler_title}</span>
        <span className="min-h-[1.25rem] font-mono text-xs text-white/45">
          {shownBlock && (
            <motion.span key={shownBlock.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
              {shownBlock.label} · {hhmm(shownBlock.s)} - {hhmm(shownBlock.e)}
            </motion.span>
          )}
        </span>
      </div>

      <div className="relative h-16 md:h-20" onPointerLeave={() => setActive(null)}>
        {/* saat çizgileri */}
        {hours.map((h, i) => (
          <div key={h} className="absolute inset-y-0 border-l border-white/[0.06]" style={{ left: `${pct(h)}%` }}>
            {i % 2 === 0 && (
              <span className={`absolute -bottom-6 -translate-x-1/2 font-mono text-[10px] text-white/30 ${i % 4 ? 'hidden sm:block' : ''}`}>{hhmm(h)}</span>
            )}
          </div>
        ))}

        {blocks.map((b, i) => {
          const { s, e } = b
          const color = BLOCK_COLORS[b.type]
          const isLive = i === current
          return (
            <motion.button
              type="button"
              key={b.label}
              aria-label={`${b.label} ${hhmm(s)} - ${hhmm(e)}`}
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              whileHover={{ y: -4 }}
              transition={{ duration: 0.7, delay: 1.3 + i * 0.12, ease: EASE_OUT }}
              className="absolute inset-y-2 origin-left overflow-hidden rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-white/60 md:inset-y-3"
              style={{
                left: `${pct(s)}%`,
                width: `${pct(e) - pct(s)}%`,
                background: `${color}${shownBlock === b ? '40' : '26'}`,
                borderLeft: `3px solid ${color}`,
                boxShadow: isLive ? `0 0 24px -4px ${color}` : undefined,
              }}
            >
              <span className="hidden truncate px-2 text-[11px] font-semibold text-white/85 lg:block">{b.label}</span>
            </motion.button>
          )
        })}

        {nowPct !== null && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ delay: 2.2, duration: 0.5 }}
            className="pointer-events-none absolute -inset-y-3 w-px bg-rose-400"
            style={{ left: `${nowPct}%` }}
          >
            <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-rose-400">
              <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/70" />
            </span>
            <span
              className={`absolute -top-7 whitespace-nowrap rounded bg-rose-500 ${
                nowPct > 85 ? 'right-0' : nowPct < 15 ? 'left-0' : 'left-1/2 -translate-x-1/2'
              } px-1.5 py-0.5 font-mono text-[10px] font-bold text-white`}
            >
              {copy.ruler_now} {hhmm(now ?? 0)}
            </span>
          </motion.div>
        )}
      </div>
      <div className="h-6" />
    </div>
  )
}
