'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const router = useRouter()

  useEffect(() => {
    console.error('Global error:', error)
  }, [error])

  return (
    <html lang="tr">
      <body className="flex min-h-screen items-center justify-center bg-gray-50 font-sans">
        <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <div className="mb-4 text-5xl">⚠️</div>
          <h1 className="mb-2 text-xl font-bold text-gray-900">Bir şeyler ters gitti</h1>
          <p className="mb-6 text-sm text-gray-500">
            {error.message || 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.'}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={reset}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Tekrar Dene
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Dashboard&apos;a Dön
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
