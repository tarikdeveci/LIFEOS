import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { DayReport } from '@/components/report/DayReport'

export const metadata: Metadata = { title: 'Gün Raporu' }

interface ReportPageProps {
  searchParams: Promise<{ date?: string | string[] }>
}

/** Gün raporu: /report?date=YYYY-MM-DD. Tarih istemcide çözülür (kullanıcının yerel günü). */
export default async function ReportPage({ searchParams }: ReportPageProps) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { date } = await searchParams
  return <DayReport rawDate={typeof date === 'string' ? date : null} />
}
