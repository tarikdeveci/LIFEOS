'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { EASE_OUT, Reveal, SectionHeading } from './primitives'

export interface Plan {
  name: string
  price: string
  period: string
  highlight: boolean
  badge: string | null
  features: string[]
  cta: string
  href: string
}

export function Pricing({ eyebrow, title, subtitle, plans }: { eyebrow: string; title: string; subtitle: string; plans: Plan[] }) {
  return (
    <section id="pricing" className="relative scroll-mt-24 py-28">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />
      <div className="relative mx-auto max-w-5xl px-6">
        <SectionHeading eyebrow={eyebrow} title={title} desc={subtitle} align="center" />
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {plans.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.1}>
              <PlanCard plan={plan} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function PlanCard({ plan }: { plan: Plan }) {
  // İmlecin konumu CSS değişkenine yazılır; ışık halkası karta göre hesaplanır.
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <motion.div
      onPointerMove={onMove}
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl p-px ${plan.highlight ? 'landing-border-spin' : 'bg-white/[0.08]'}`}
    >
      <div className={`relative flex h-full flex-col rounded-[15px] p-6 ${plan.highlight ? 'bg-gradient-to-b from-[#161b3a] to-[#0A0E1A]' : 'bg-[#0B0F1B]'}`}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[15px] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: 'radial-gradient(360px circle at var(--mx) var(--my), rgba(129,140,248,0.14), transparent 60%)' }}
        />
        {plan.badge && (
          <span className="absolute right-4 top-4 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-2.5 py-0.5 text-[11px] font-bold text-white">{plan.badge}</span>
        )}
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-white/45">{plan.name}</p>
        <div className="mb-6 flex items-end gap-1">
          <span className="text-4xl font-black text-white">{plan.price}</span>
          <span className="mb-1 text-sm text-white/40">{plan.period}</span>
        </div>
        <ul className="relative mb-7 flex-1 space-y-2.5">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-white/65">
              <span className="mt-0.5 shrink-0 text-emerald-400">✓</span>
              {f}
            </li>
          ))}
        </ul>
        <Link
          href={plan.href}
          className={`relative block rounded-xl py-2.5 text-center text-sm font-semibold transition ${
            plan.highlight ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
          }`}
        >
          {plan.cta}
        </Link>
      </div>
    </motion.div>
  )
}

export function Faq({ title, items }: { title: string; items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <Reveal>
        <h2 className="mb-10 text-center text-3xl font-black tracking-tight text-white md:text-4xl">{title}</h2>
      </Reveal>
      <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
        {items.map(({ q, a }, i) => {
          const isOpen = open === i
          return (
            <Reveal key={q} delay={i * 0.05} y={12}>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 py-5 text-left"
              >
                <span className={`text-sm font-semibold transition-colors md:text-base ${isOpen ? 'text-white' : 'text-white/75'}`}>{q}</span>
                <motion.span animate={{ rotate: isOpen ? 45 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="shrink-0 text-xl leading-none text-white/40">
                  +
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.35, ease: EASE_OUT }}
                    className="overflow-hidden"
                  >
                    <p className="pb-5 text-sm leading-relaxed text-white/50">{a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </Reveal>
          )
        })}
      </div>
    </section>
  )
}
