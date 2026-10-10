'use client'

import { useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import type { BlockType } from './copy'

/** Uygulamadaki blok renkleriyle aynı aile: gün cetveli ve yerleştirme sahnesi paylaşır. */
export const BLOCK_COLORS: Record<BlockType, string> = {
  routine: '#22D3EE',
  focus: '#818CF8',
  task: '#A78BFA',
  meal: '#34D399',
  workout: '#F59E0B',
}

export const EASE_OUT = [0.22, 1, 0.36, 1] as const

interface RevealProps {
  children: ReactNode
  delay?: number
  className?: string
  y?: number
}

/** Görünür alana girince aşağıdan süzülerek belirir; bir kez oynar. */
export function Reveal({ children, delay = 0, className, y = 28 }: RevealProps) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8, delay, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  )
}

interface SectionHeadingProps {
  eyebrow: string
  title: string
  desc?: string
  align?: 'left' | 'center'
}

export function SectionHeading({ eyebrow, title, desc, align = 'left' }: SectionHeadingProps) {
  const center = align === 'center'
  return (
    <div className={center ? 'mx-auto max-w-2xl text-center' : 'max-w-xl'}>
      <Reveal>
        <span className="mb-4 inline-block font-mono text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300/80">
          {eyebrow}
        </span>
      </Reveal>
      <Reveal delay={0.08}>
        <h2 className="text-balance text-3xl font-black leading-[1.1] tracking-tight text-white md:text-5xl">{title}</h2>
      </Reveal>
      {desc && (
        <Reveal delay={0.16}>
          <p className="mt-5 text-pretty leading-relaxed text-white/55 md:text-lg">{desc}</p>
        </Reveal>
      )}
    </div>
  )
}

interface MagneticLinkProps {
  href: string
  children: ReactNode
  className?: string
  external?: boolean
}

/** İmleç yaklaşınca hafifçe ona doğru çekilen bağlantı düğmesi. */
export function MagneticLink({ href, children, className, external }: MagneticLinkProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const reduce = useReducedMotion()
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 16 })
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 16 })

  function onMove(e: React.PointerEvent) {
    if (reduce || e.pointerType !== 'mouse' || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    x.set((e.clientX - (r.left + r.width / 2)) * 0.25)
    y.set((e.clientY - (r.top + r.height / 2)) * 0.35)
  }
  function onLeave() {
    x.set(0)
    y.set(0)
  }

  const inner = (
    <motion.span ref={ref} style={{ x, y }} className={`inline-flex ${className ?? ''}`} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
    </motion.span>
  )
  if (external) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex">{inner}</a>
  }
  return <Link href={href} className="inline-flex">{inner}</Link>
}
