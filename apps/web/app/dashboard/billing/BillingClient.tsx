'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { useToast } from '@/components/ui/Toast'

const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '$0',
    period: 'sonsuza dek',
    features: [
      'Sınırsız görev yönetimi',
      'Günlük zaman planlama',
      'Beslenme takibi (manuel)',
      'Temel raporlar',
    ],
    unavailable: [
      'AI beslenme koçu',
      'AI görev önceliklendirme',
      'AI günlük plan önerileri',
      'AI antrenman koçu',
    ],
    cta: 'Mevcut Plan',
    planKey: null as null,
  },
  {
    key: 'pro_monthly',
    name: 'Pro Aylık',
    price: '$4.99',
    period: 'ay',
    badge: null as string | null,
    features: [
      'Sınırsız görev yönetimi',
      'Günlük zaman planlama',
      'AI beslenme koçu',
      'AI görev önceliklendirme',
      'AI günlük plan önerileri',
      'AI antrenman koçu',
      'Beslenme takibi (AI parse)',
      'Öncelikli destek',
    ],
    unavailable: [] as string[],
    cta: 'Aylık Başla',
    planKey: 'pro_monthly' as const,
  },
  {
    key: 'pro_annual',
    name: 'Pro Yıllık',
    price: '$39',
    period: 'yıl',
    badge: '%35 indirim',
    features: [
      'Sınırsız görev yönetimi',
      'Günlük zaman planlama',
      'AI beslenme koçu',
      'AI görev önceliklendirme',
      'AI günlük plan önerileri',
      'AI antrenman koçu',
      'Beslenme takibi (AI parse)',
      'Öncelikli destek',
    ],
    unavailable: [] as string[],
    cta: 'Yıllık Başla',
    planKey: 'pro_annual' as const,
  },
]

export default function BillingClient() {
  const { subscription, loading, isPro } = useSubscription()
  const [upgrading, setUpgrading] = useState<string | null>(null)
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const { showToast } = useToast()

  useEffect(() => {
    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success === 'true') {
      showToast('Pro aboneliğiniz başarıyla aktifleştirildi! 🎉', 'success')
    } else if (error) {
      const messages: Record<string, string> = {
        payment_failed: 'Ödeme başarısız oldu. Lütfen tekrar deneyin.',
        verification_failed: 'Ödeme doğrulanamadı. Destek ile iletişime geçin.',
        server_error: 'Sunucu hatası. Lütfen tekrar deneyin.',
        no_token: 'Geçersiz ödeme oturumu.',
        not_found: 'Abonelik bulunamadı.',
      }
      showToast(messages[error] ?? 'Bir hata oluştu.', 'error')
    }
  }, [searchParams, showToast])

  async function handleUpgrade(planKey: 'pro_monthly' | 'pro_annual') {
    setUpgrading(planKey)
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey }),
      })
      const data = await res.json() as { checkoutFormContent?: string; paymentPageUrl?: string; error?: string }

      if (!res.ok || data.error) {
        showToast(data.error ?? 'Ödeme başlatılamadı', 'error')
        return
      }

      if (data.checkoutFormContent) {
        setCheckoutHtml(data.checkoutFormContent)
      } else if (data.paymentPageUrl) {
        window.location.href = data.paymentPageUrl
      }
    } catch {
      showToast('Ödeme başlatılırken hata oluştu', 'error')
    } finally {
      setUpgrading(null)
    }
  }

  const currentPlan = subscription?.status ?? 'free'
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('tr-TR')
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-primary">Abonelik</h1>
        <p className="mt-1 text-sm text-muted">AI özelliklerinin tamamına erişin</p>
      </div>

      {/* Mevcut durum */}
      {isPro && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-accent">
                {currentPlan === 'pro_annual' ? 'Pro Yıllık' : 'Pro Aylık'} aktif
              </p>
              {periodEnd && (
                <p className="text-xs text-muted mt-0.5">
                  {subscription?.cancel_at_period_end
                    ? `${periodEnd} tarihinde iptal olacak`
                    : `Yenileme: ${periodEnd}`}
                </p>
              )}
            </div>
            <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              Pro
            </span>
          </div>
        </div>
      )}

      {/* Plan kartları */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.key || (isPro && plan.key === 'free' ? false : currentPlan === plan.key)
          const isCurrentFree = !isPro && plan.key === 'free'
          const highlight = plan.key === 'pro_annual'

          return (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                highlight
                  ? 'border-accent bg-gradient-to-b from-accent/5 to-white shadow-md'
                  : 'border-gray-200 bg-white'
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-0.5 text-xs font-bold text-white">
                  {plan.badge}
                </span>
              )}

              <div className="mb-4">
                <h2 className="text-base font-bold text-primary">{plan.name}</h2>
                <div className="mt-1 flex items-end gap-1">
                  <span className="text-3xl font-black text-primary">{plan.price}</span>
                  <span className="mb-1 text-xs text-muted">/{plan.period}</span>
                </div>
              </div>

              <ul className="mb-6 flex-1 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-primary">
                    <span className="mt-0.5 shrink-0 text-green-500">✓</span>
                    {f}
                  </li>
                ))}
                {plan.unavailable.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted line-through">
                    <span className="mt-0.5 shrink-0">✗</span>
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrentFree || isCurrent ? (
                <div className="rounded-xl border border-gray-200 py-2 text-center text-sm font-medium text-muted">
                  Mevcut Plan
                </div>
              ) : plan.planKey ? (
                <button
                  onClick={() => void handleUpgrade(plan.planKey!)}
                  disabled={upgrading !== null}
                  className={`rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                    highlight
                      ? 'bg-accent text-white hover:bg-accent/90'
                      : 'border border-accent text-accent hover:bg-accent/5'
                  }`}
                >
                  {upgrading === plan.planKey ? 'Yönlendiriliyor...' : plan.cta}
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* FAQ */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-primary">Sık Sorulan Sorular</h2>
        <div className="space-y-4">
          {[
            {
              q: 'Ödeme güvenli mi?',
              a: 'Evet. Ödemeler İyzico altyapısı üzerinden işlenir. Kart bilgileriniz bizde saklanmaz.',
            },
            {
              q: 'İptal edebilir miyim?',
              a: 'Evet, istediğiniz zaman iptal edebilirsiniz. Mevcut dönem sonuna kadar Pro özelliklerine erişiminiz devam eder.',
            },
            {
              q: 'Yıllık plandan aylığa geçebilir miyim?',
              a: 'Evet, mevcut dönem bittikten sonra planınızı değiştirebilirsiniz.',
            },
            {
              q: 'AI özellikleri neler?',
              a: 'AI beslenme koçu, AI meal parsing, AI görev önceliklendirme (WSJF), AI günlük plan önerileri ve AI antrenman koçu.',
            },
          ].map(({ q, a }) => (
            <div key={q}>
              <p className="text-sm font-semibold text-primary">{q}</p>
              <p className="mt-1 text-sm text-muted">{a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* İyzico checkout modal */}
      {checkoutHtml && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-2">
            <button
              onClick={() => setCheckoutHtml(null)}
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md text-gray-500 hover:text-gray-900"
            >
              ×
            </button>
            <div
              dangerouslySetInnerHTML={{ __html: checkoutHtml }}
              className="iyzico-checkout-form"
            />
          </div>
        </div>
      )}
    </div>
  )
}
