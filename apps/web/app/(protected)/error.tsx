'use client'

import { useEffect } from 'react'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="mx-auto max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm border border-gray-100">
        <div className="mb-3 text-4xl">⚠️</div>
        <h2 className="mb-1 text-base font-semibold text-gray-900">Bir hata oluştu</h2>
        <p className="mb-4 text-sm text-gray-500">
          {error.message || 'İçerik yüklenirken bir sorun oluştu.'}
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Tekrar Dene
        </button>
      </div>
    </div>
  )
}
