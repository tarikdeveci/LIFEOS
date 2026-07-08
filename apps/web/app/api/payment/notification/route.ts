import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyNotificationHash } from '@/lib/paytr'

function getAdminClient() {
  return createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  )
}

// PayTR IPN: server-to-server ödeme bildirimi
export async function POST(req: Request) {
  const supabaseAdmin = getAdminClient()

  try {
    const formData = await req.formData()
    const merchantOid = formData.get('merchant_oid')?.toString() ?? ''
    const status = formData.get('status')?.toString() ?? ''
    const totalAmount = formData.get('total_amount')?.toString() ?? ''
    const hash = formData.get('hash')?.toString() ?? ''

    if (!merchantOid || !status || !totalAmount || !hash) {
      return new NextResponse('PAYTR_IPN_INVALID', { status: 400 })
    }

    if (!verifyNotificationHash(merchantOid, status, totalAmount, hash)) {
      console.error('PayTR hash doğrulama başarısız:', { merchantOid })
      return new NextResponse('PAYTR_IPN_INVALID', { status: 400 })
    }

    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id, plan')
      .eq('paytr_merchant_oid', merchantOid)
      .single()

    if (!subscription) {
      console.error('Abonelik bulunamadı merchant_oid:', merchantOid)
      return new NextResponse('OK')
    }

    const planKey = subscription.plan as 'pro_monthly' | 'pro_annual'

    if (status === 'success') {
      const now = new Date()
      const periodEnd = new Date(now)
      if (planKey === 'pro_annual') {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1)
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1)
      }

      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: planKey,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
          cancelled_at: null,
        })
        .eq('user_id', subscription.user_id)

      await supabaseAdmin.from('payment_history').insert({
        user_id: subscription.user_id,
        amount: parseFloat(totalAmount) / 100,
        currency: 'TRY',
        status: 'success',
        paytr_merchant_oid: merchantOid,
        plan: planKey,
        description: `${planKey === 'pro_annual' ? 'Yıllık' : 'Aylık'} Pro abonelik`,
      })
    } else {
      await supabaseAdmin.from('payment_history').insert({
        user_id: subscription.user_id,
        amount: parseFloat(totalAmount) / 100,
        currency: 'TRY',
        status: 'failure',
        paytr_merchant_oid: merchantOid,
        plan: planKey,
        description: 'Ödeme başarısız',
        error_message: formData.get('failed_reason_code')?.toString(),
      })
    }

    // PayTR OK yanıtı bekler
    return new NextResponse('OK')
  } catch (err) {
    console.error('PayTR notification error:', err)
    return new NextResponse('PAYTR_IPN_INVALID', { status: 500 })
  }
}
