'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  CheckSquare,
  CalendarDays,
  Salad,
  Dumbbell,
  Settings,
  CreditCard,
  type LucideIcon,
} from 'lucide-react'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { useLang } from '@/lib/contexts/LangContext'

export default function Sidebar() {
  const pathname = usePathname()
  const { isPro, loading: subLoading } = useSubscription()
  const { t } = useLang()

  const NAV_ITEMS: { href: string; label: string; Icon: LucideIcon; dot: string }[] = [
    { href: '/dashboard',  label: t.dash_today,     Icon: LayoutDashboard, dot: '#6366F1' },
    { href: '/tasks',      label: t.dash_tasks,     Icon: CheckSquare,     dot: '#3B82F6' },
    { href: '/planning',   label: t.dash_planning,  Icon: CalendarDays,    dot: '#8B5CF6' },
    { href: '/nutrition',  label: t.dash_nutrition, Icon: Salad,           dot: '#059669' },
    { href: '/workout',    label: t.dash_workout,   Icon: Dumbbell,        dot: '#F59E0B' },
    { href: '/settings',   label: t.dash_settings,  Icon: Settings,        dot: '#64748B' },
  ]

  return (
    <aside className="glass-sidebar flex w-56 flex-col">
      {/* Logo */}
      <div className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="LifeOS" className="h-8 w-8 rounded-xl object-contain shadow-md shadow-indigo-500/20" />
          <span className="text-[17px] font-extrabold tracking-tight text-primary">
            Life<span className="text-accent">OS</span>
          </span>
        </div>
        <div className="mt-4 h-px bg-gradient-to-r from-accent/20 via-accent/10 to-transparent" />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map(({ href, label, Icon, dot }) => {
          const isActive =
            href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150 ${
                isActive
                  ? 'glass-accent text-accent shadow-sm'
                  : 'text-muted hover:bg-accent/5 hover:text-primary'
              }`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="flex-1">{label}</span>
              {isActive && (
                <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3">
        <div className="mb-3 h-px bg-gradient-to-r from-border/60 via-border/30 to-transparent" />
        {!subLoading && !isPro && (
          <Link
            href="/billing"
            className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150 ${
              pathname.startsWith('/billing')
                ? 'glass-accent text-accent shadow-sm'
                : 'bg-gradient-to-r from-accent/10 to-accent-violet/10 text-accent hover:from-accent/20 hover:to-accent-violet/20'
            }`}
          >
            <CreditCard size={16} className="shrink-0" />
            <span className="flex-1">{t.dash_upgrade}</span>
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold text-white">✨</span>
          </Link>
        )}
        {isPro && pathname.startsWith('/billing') && (
          <Link
            href="/billing"
            className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-medium glass-accent text-accent shadow-sm"
          >
            <CreditCard size={16} className="shrink-0" />
            <span>{t.dash_billing}</span>
          </Link>
        )}
      </div>
    </aside>
  )
}
