import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import TasksClientPage from '@/components/tasks/TasksClientPage'

export const metadata: Metadata = { title: 'Görevler' }

export default async function TasksPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return <TasksClientPage userId={user.id} />
}
