import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Sayfa Bulunamadı' }

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <div className="mb-4 text-6xl font-black text-indigo-600">404</div>
        <h1 className="mb-2 text-xl font-bold text-gray-900">Sayfa Bulunamadı</h1>
        <p className="mb-6 text-sm text-gray-500">
          Aradığınız sayfa mevcut değil veya taşınmış olabilir.
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Dashboard&apos;a Dön
        </Link>
      </div>
    </div>
  )
}
