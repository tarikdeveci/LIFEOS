import { NextResponse } from 'next/server'

const APP_URL = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'

// PayTR ödeme tamamlandıktan sonra kullanıcıyı buraya yönlendirir
export async function GET(req: Request) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  if (status === 'success') {
    return NextResponse.redirect(`${APP_URL}/dashboard/billing?success=true`)
  }

  return NextResponse.redirect(`${APP_URL}/dashboard/billing?error=payment_failed`)
}

// PayTR bazen POST olarak da gönderir
export async function POST(req: Request) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  if (status === 'success') {
    return NextResponse.redirect(`${APP_URL}/dashboard/billing?success=true`)
  }

  return NextResponse.redirect(`${APP_URL}/dashboard/billing?error=payment_failed`)
}
