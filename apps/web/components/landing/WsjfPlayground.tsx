'use client'

import { useEffect, useState } from 'react'
import { motion, useSpring, useTransform } from 'motion/react'
import { calculateWsjf, wsjfToPriorityLabel, type WsjfScores } from '@lifeos/shared'
import type { LandingCopy } from './copy'
import { Reveal, SectionHeading } from './primitives'

// Başlangıç puanları dört öncelik seviyesini birer kez gösterecek şekilde seçildi;
// sıra, gün kurma sahnesindeki havuzla aynı: vergi, doktor, sunum, dolap.
const INITIAL: WsjfScores[] = [
  { value_score: 4, urgency_score: 5, risk_score: 5, effort_score: 2, friction_score: 2 },
  { value_score: 3, urgency_score: 3, risk_score: 2, effort_score: 3, friction_score: 3 },
  { value_score: 2, urgency_score: 2, risk_score: 3, effort_score: 1, friction_score: 3 },
  { value_score: 2, urgency_score: 1, risk_score: 1, effort_score: 3, friction_score: 3 },
]

const LEVEL_STYLE = {
  critical: 'bg-rose-500/15 text-rose-300 ring-rose-400/30',
  high: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
  medium: 'bg-indigo-500/15 text-indigo-300 ring-indigo-400/30',
  low: 'bg-white/5 text-white/45 ring-white/10',
} as const

type ScoreKey = keyof WsjfScores

export function WsjfPlayground({ copy }: { copy: LandingCopy }) {
  const [scores, setScores] = useState<WsjfScores[]>(INITIAL)
  const [selected, setSelected] = useState(1)

  const ranked = scores
    .map((s, i) => ({ i, score: calculateWsjf(s) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)

  const top: { key: ScoreKey; label: string }[] = [
    { key: 'value_score', label: copy.wsjf_value },
    { key: 'urgency_score', label: copy.wsjf_urgency },
    { key: 'risk_score', label: copy.wsjf_risk },
  ]
  const bottom: { key: ScoreKey; label: string }[] = [
    { key: 'effort_score', label: copy.wsjf_effort },
    { key: 'friction_score', label: copy.wsjf_friction },
  ]
  const cur = scores[selected] ?? INITIAL[0]!

  function set(key: ScoreKey, v: number) {
    setScores((prev) => prev.map((s, i) => (i === selected ? { ...s, [key]: v } : s)))
  }

  return (
    <section id="features" className="relative mx-auto max-w-7xl scroll-mt-24 px-6 py-28">
      <SectionHeading eyebrow={copy.wsjf_eyebrow} title={copy.wsjf_title} desc={copy.wsjf_desc} />

      <div className="mt-14 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Reveal>
          <ul className="space-y-2.5" aria-live="polite">
            {ranked.map(({ i, score }, rank) => {
              const level = wsjfToPriorityLabel(score)
              const isSel = i === selected
              return (
                <motion.li key={i} layout transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    aria-pressed={isSel}
                    className={`group flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${
                      isSel ? 'border-indigo-400/50 bg-indigo-500/10' : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20'
                    }`}
                  >
                    <span className="w-6 font-mono text-sm font-bold text-white/30">{rank + 1}</span>
                    <span className="flex-1 text-sm font-semibold text-white/90 md:text-base">{copy.wsjf_tasks[i]}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ${LEVEL_STYLE[level]}`}>
                      {copy.wsjf_levels[level]}
                    </span>
                    <span className="w-12 text-right font-mono text-sm font-bold tabular-nums text-white">{score.toFixed(2)}</span>
                  </button>
                </motion.li>
              )
            })}
          </ul>
          <p className="mt-4 text-xs text-white/35">{copy.wsjf_hint}</p>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 md:p-8">
            <div aria-hidden className="absolute -right-20 -top-20 h-60 w-60 rounded-full bg-indigo-600/20 blur-3xl" />
            <motion.p key={selected} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="relative mb-6 text-sm font-semibold text-white/80">
              {copy.wsjf_tasks[selected]}
            </motion.p>

            <div className="relative space-y-4">
              {top.map((f) => (
                <ScoreSlider key={f.key} label={f.label} value={cur[f.key]} onChange={(v) => set(f.key, v)} tone="up" />
              ))}
              <div className="h-px bg-white/10" />
              {bottom.map((f) => (
                <ScoreSlider key={f.key} label={f.label} value={cur[f.key]} onChange={(v) => set(f.key, v)} tone="down" />
              ))}
            </div>

            <div className="relative mt-8 flex items-end justify-between gap-4 border-t border-white/10 pt-6">
              <div className="font-mono text-xs leading-relaxed text-white/45">
                ({cur.value_score} + {cur.urgency_score} + {cur.risk_score})
                <br />÷ ({cur.effort_score} + {cur.friction_score})
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-widest text-white/40">{copy.wsjf_formula}</p>
                <AnimatedScore value={calculateWsjf(cur)} />
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function ScoreSlider({ label, value, onChange, tone }: { label: string; value: number; onChange: (v: number) => void; tone: 'up' | 'down' }) {
  const color = tone === 'up' ? '#818CF8' : '#F59E0B'
  const fill = ((value - 1) / 4) * 100
  return (
    <label className="flex items-center gap-4">
      <span className="w-20 text-sm text-white/60">{label}</span>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="landing-range h-2 flex-1 cursor-pointer appearance-none rounded-full"
        style={{ background: `linear-gradient(to right, ${color} ${fill}%, rgba(255,255,255,0.1) ${fill}%)`, accentColor: color }}
      />
      <motion.span key={value} initial={{ scale: 1.5, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} className="w-4 text-right font-mono text-sm font-bold text-white">
        {value}
      </motion.span>
    </label>
  )
}

function AnimatedScore({ value }: { value: number }) {
  const spring = useSpring(value, { stiffness: 120, damping: 18 })
  const text = useTransform(spring, (v) => v.toFixed(2))
  useEffect(() => {
    spring.set(value)
  }, [spring, value])
  return <motion.span className="block bg-gradient-to-r from-white to-indigo-200 bg-clip-text font-mono text-5xl font-black tabular-nums text-transparent">{text}</motion.span>
}
