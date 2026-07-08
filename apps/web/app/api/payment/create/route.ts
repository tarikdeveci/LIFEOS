import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { createPayTRPayment, PLANS, type PlanKey } from '@/lib/paytr'

function getUserIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  const realIp = req.headers.get('x-real-ip')
  let ip = '127.0.0.1'
  if (forwarded) ip = forwarded.split(',')[0]?.trim() ?? '127.0.0.1'
  else if (realIp) ip = realIp
  // IPv6 localhost → IPv4
  if (ip === '::1') return '127.0.0.1'
  // IPv4-mapped IPv6 (::ffff:x.x.x.x) → IPv4
  if (ip.startsWith('::ffff:')) return ip.slice(7)
  return ip
}

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
    }

    const { planKey } = (await req.json()) as { planKey: PlanKey }

    if (!planKey || !PLANS[planKey]) {
      return NextResponse.json({ error: 'Geçersiz plan' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()

    const userName = profile?.display_name ?? 'LifeOS User'
    const appUrl = (process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000').trim()
    const userIp = getUserIp(req)

    const { merchantOid, paymentUrl } = await createPayTRPayment({
      userId: user.id,
      email: user.email ?? '',
      userName,
      userIp,
      planKey,
      okUrl: `${appUrl}/api/payment/callback?status=success`,
      failUrl: `${appUrl}/api/payment/callback?status=failure`,
      notificationUrl: `${appUrl}/api/payment/notification`,
    })

    // merchant_oid'i geçici olarak kaydet
    await supabase
      .from('subscriptions')
      .upsert(
        { user_id: user.id, paytr_merchant_oid: merchantOid, plan: planKey },
        { onConflict: 'user_id' },
      )

    return NextResponse.json({ paymentUrl })
  } catch (err) {
    console.error('Payment create error:', err)
    return NextResponse.json({ error: 'Ödeme başlatılırken hata oluştu' }, { status: 500 })
  }
}
