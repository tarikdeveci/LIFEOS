import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PlanningView } from '@/components/planning/PlanningView'

export const metadata: Metadata = {
  title: 'Planlama - LifeOS',
  description: 'Günlük zaman planlaması ve görev yönetimi',
}

export default async function PlanningPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <PlanningView userId={user.id} />
}
