import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import NutritionClient from '@/components/nutrition/NutritionClient'

export const metadata: Metadata = { title: 'Beslenme' }

export default async function NutritionPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <NutritionClient userId={user.id} />
}
