'use client'

import Link from 'next/link'
import { useSubscription } from '@/lib/hooks/useSubscription'

interface ProGateProps {
  children: React.ReactNode
  featureName?: string
}

export function ProGate({ children, featureName = 'Bu özellik' }: ProGateProps) {
  const { isPro, loading } = useSubscription()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!loading && !isPro) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-accent/30 bg-accent/5 p-8 text-center">
        <div className="mb-3 text-3xl">✨</div>
        <h3 className="mb-1 text-sm font-semibold text-primary">Pro Özellik</h3>
        <p className="mb-4 text-xs text-muted">
          {featureName} Pro abonelik gerektirir.
        </p>
        <Link
          href="/billing"
          className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent/90"
        >
          Pro&apos;ya Geç →
        </Link>
      </div>
    )
  }

  return <>{children}</>
}
