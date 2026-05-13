import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { initializeCheckoutForm, PLANS, type PlanKey } from '@/lib/iyzico'

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

    const plan = PLANS[planKey]
    const conversationId = `${user.id}-${Date.now()}`
    const callbackUrl = `${process.env['NEXT_PUBLIC_APP_URL']}/api/payment/callback`

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('id', user.id)
      .single()

    const displayName = profile?.display_name ?? 'LifeOS User'
    const nameParts = displayName.split(' ')
    const name = nameParts[0] ?? 'LifeOS'
    const surname = nameParts.slice(1).join(' ') || 'User'

    const result = await initializeCheckoutForm({
      conversationId,
      price: plan.price,
      userId: user.id,
      email: user.email ?? '',
      name,
      surname,
      callbackUrl,
      planKey,
    })

    if (result.status !== 'success' || !result.token) {
      console.error('İyzico checkout init failed:', result)
      return NextResponse.json(
        { error: result.errorMessage ?? 'Ödeme başlatılamadı' },
        { status: 400 },
      )
    }

    // Token'ı geçici olarak kaydet
    const subClient = supabase as unknown as { from: (t: string) => { upsert: (v: unknown, o: unknown) => Promise<unknown> } }
    await subClient.from('subscriptions').upsert(
      { user_id: user.id, iyzico_token: result.token, plan: planKey },
      { onConflict: 'user_id' },
    )

    return NextResponse.json({
      token: result.token,
      checkoutFormContent: result.checkoutFormContent,
      paymentPageUrl: result.paymentPageUrl,
    })
  } catch (err) {
    console.error('Payment create error:', err)
    return NextResponse.json({ error: 'Ödeme başlatılırken hata oluştu' }, { status: 500 })
  }
}
