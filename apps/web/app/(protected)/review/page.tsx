import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { WeeklyReview } from '@/components/review/WeeklyReview'

export const metadata: Metadata = { title: 'Haftalık Değerlendirme' }

export default async function ReviewPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <WeeklyReview userId={user.id} />
}
