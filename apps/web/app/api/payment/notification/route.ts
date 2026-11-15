import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyNotificationHash } from '@/lib/paytr'
import { paytrNetMonthlyUsd } from '@/lib/paytrNet'
import { handlePaytrNotification } from '@/lib/paytrNotification'

function getAdminClient() {
  return createClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  )
}

// PayTR IPN: server-to-server ödeme bildirimi. Yanıt kuralları lib/paytrNotification.ts'te:
// yalnızca işlem gerçekten yazıldığında (ya da kalıcı olarak yazılamayacaksa) "OK" döner.
export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const result = await handlePaytrNotification(
      {
        merchantOid: formData.get('merchant_oid')?.toString() ?? '',
        status: formData.get('status')?.toString() ?? '',
        totalAmount: formData.get('total_amount')?.toString() ?? '',
        hash: formData.get('hash')?.toString() ?? '',
        failedReasonCode: formData.get('failed_reason_code')?.toString(),
      },
      {
        db: getAdminClient(),
        verifyHash: verifyNotificationHash,
        netMonthlyUsd: (totalAmount, plan) =>
          paytrNetMonthlyUsd(totalAmount, plan, {
            usdTry: process.env['AI_USD_TRY'],
            commissionPct: process.env['PAYTR_COMMISSION_PCT'],
          }),
      },
    )
    return new NextResponse(result.body, { status: result.status })
  } catch (err) {
    console.error('PayTR notification error:', err)
    return new NextResponse('PAYTR_IPN_RETRY', { status: 500 })
  }
}
