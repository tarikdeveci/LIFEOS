import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import Sidebar from '@/components/ui/Sidebar'
import RealtimeProvider from '@/components/providers/RealtimeProvider'
import { LangProvider } from '@/lib/contexts/LangContext'
import { ThemeProvider } from '@/lib/contexts/ThemeContext'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  return (
    <ThemeProvider>
      <LangProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-background/30">
            <div className="min-h-full p-6">
              <RealtimeProvider>{children}</RealtimeProvider>
            </div>
          </main>
        </div>
      </LangProvider>
    </ThemeProvider>
  )
}
