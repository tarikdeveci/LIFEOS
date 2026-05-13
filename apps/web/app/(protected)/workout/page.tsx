import type { Metadata } from 'next'
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WorkoutView } from '@/components/workout/WorkoutView'

export const metadata: Metadata = {
  title: 'Antrenman - LifeOS',
  description: 'Spor takibi ve AI fitness koçu',
}

export default async function WorkoutPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <WorkoutView userId={user.id} />
}
