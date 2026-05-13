import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { retrieveCheckoutFormResult } from '@/lib/iyzico'

// Lazy init — module-level client would fail during build (no env vars)
function getAdminClient() {
  return createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  )
}

export async function POST(req: Request) {
  const supabaseAdmin = getAdminClient()
  try {
    const formData = await req.formData()
    const token = formData.get('token')?.toString()
    const status = formData.get('status')?.toString()

    if (!token) {
      return NextResponse.redirect(
        `${process.env['NEXT_PUBLIC_APP_URL']}/billing?error=no_token`,
      )
    }

    if (status === 'failure') {
      return NextResponse.redirect(
        `${process.env['NEXT_PUBLIC_APP_URL']}/billing?error=payment_failed`,
      )
    }

    // Token'ı doğrula
    const result = await retrieveCheckoutFormResult(token)

    if (result.status !== 'success') {
      console.error('İyzico callback verification failed:', result)
      return NextResponse.redirect(
        `${process.env['NEXT_PUBLIC_APP_URL']}/billing?error=verification_failed`,
      )
    }

    // Token ile subscription'ı bul
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id, plan')
      .eq('iyzico_token', token)
      .single()

    if (!subscription) {
      console.error('Subscription not found for token:', token)
      return NextResponse.redirect(
        `${process.env['NEXT_PUBLIC_APP_URL']}/billing?error=not_found`,
      )
    }

    const planKey = subscription.plan as 'pro_monthly' | 'pro_annual'
    const now = new Date()
    const periodEnd = new Date(now)
    if (planKey === 'pro_annual') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1)
    }

    // Aboneliği güncelle
    await supabaseAdmin
      .from('subscriptions')
      .update({
        status: planKey,
        iyzico_payment_id: result.paymentId,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        cancel_at_period_end: false,
        cancelled_at: null,
      })
      .eq('user_id', subscription.user_id)

    // Ödeme geçmişi kaydet
    await supabaseAdmin.from('payment_history').insert({
      user_id: subscription.user_id,
      amount: result.paidPrice ?? result.price ?? 0,
      currency: result.currency ?? 'USD',
      status: 'success',
      iyzico_payment_id: result.paymentId,
      iyzico_conversation_id: result.conversationId,
      plan: planKey,
      description: `${planKey === 'pro_annual' ? 'Yıllık' : 'Aylık'} Pro abonelik`,
    })

    return NextResponse.redirect(
      `${process.env['NEXT_PUBLIC_APP_URL']}/billing?success=true`,
    )
  } catch (err) {
    console.error('Payment callback error:', err)
    return NextResponse.redirect(
      `${process.env['NEXT_PUBLIC_APP_URL']}/billing?error=server_error`,
    )
  }
}

// GET de destekle (bazı durumlarda redirect ile gelir)
export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return NextResponse.redirect(
      `${process.env['NEXT_PUBLIC_APP_URL']}/billing?error=no_token`,
    )
  }

  // POST ile aynı mantık
  const fakeFormData = new FormData()
  fakeFormData.set('token', token)
  fakeFormData.set('status', 'success')

  const mockReq = new Request(req.url, {
    method: 'POST',
    body: fakeFormData,
  })

  return POST(mockReq)
}
