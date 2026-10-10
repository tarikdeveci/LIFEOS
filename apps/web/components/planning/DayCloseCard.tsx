'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Moon } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'

interface DayCloseCardProps {
  userId: string
  /** Bugünün yerel tarihi, 'YYYY-MM-DD'. */
  date: string
}

const DEFAULT_EVENING_HOUR = 18
const TICK_MS = 60_000

/**
 * "Günü kapat": akşam saatinden sonra bugünün raporunu açan tek satırlık kart (mobildeki
 * karşılığıyla aynı kural). Akşam saati notification_preferences.evening_hour; okunamazsa 18.
 * Saat okunana kadar kart görünmez, böylece 18'de belirip 21'de kaybolan bir titreme olmaz.
 */
export function DayCloseCard({ userId, date }: DayCloseCardProps) {
  const { t } = useLang()
  const [eveningHour, setEveningHour] = useState<number | null>(null)
  const [hour, setHour] = useState(() => new Date().getHours())

  useEffect(() => {
    let alive = true
    void (async () => {
      let value = DEFAULT_EVENING_HOUR
      try {
        const { data } = await supabase
          .from('notification_preferences')
          .select('evening_hour')
          .eq('user_id', userId)
          .maybeSingle()
        const read = (data as { evening_hour?: unknown } | null)?.evening_hour
        if (typeof read === 'number' && Number.isInteger(read) && read >= 0 && read <= 23) value = read
      } catch {
        // Okunamazsa varsayılan akşam saati.
      }
      if (alive) setEveningHour(value)
    })()
    return () => { alive = false }
  }, [userId])

  // Sayfa açık kalırsa kart akşam saati gelince kendiliğinden belirir.
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  if (eveningHour === null || hour < eveningHour) return null

  return (
    <Link href={`/report?date=${date}`}
      className="glass flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors hover:border-accent/40">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
        <Moon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-primary">{t.report_close_title}</span>
        {/* Sayı yok: rapor halkası işleri farklı kuralla sayar, iki ayrı oran görünmesin. */}
        <span className="block truncate text-xs text-muted">{t.report_close_sub_plain}</span>
      </span>
      <ChevronRight className="h-4 w-4 text-subtle" />
    </Link>
  )
}
