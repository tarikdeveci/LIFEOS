import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import SettingsClient from '@/components/settings/SettingsClient'

export const metadata: Metadata = { title: 'Ayarlar' }

export default async function SettingsPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <SettingsClient userId={user.id} />
}
