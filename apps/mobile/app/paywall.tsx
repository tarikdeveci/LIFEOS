import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import * as WebBrowser from 'expo-web-browser'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useSubscriptionStatus } from '@/src/contexts/SubscriptionContext'
import { fetchProPlans, purchasePlan, restorePurchases, type ProPeriod, type ProPlan } from '@/src/utils/purchases'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

// Apple'in standart EULA'si — ASC'de ozel bir sozlesme tanimli degil.
const EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
const PRIVACY_URL = 'https://lifeos.tr/gizlilik-kvkk'
const TERMS_URL = 'https://lifeos.tr/mesafeli-satis-sozlesmesi'

const BENEFITS: Array<{ icon: keyof typeof Ionicons.glyphMap; tr: string; en: string }> = [
  { icon: 'restaurant-outline', tr: 'Öğün fotoğrafını ve metnini AI ile çöz', en: 'Parse meals from free text with AI' },
  { icon: 'nutrition-outline', tr: 'Beslenme koçu: makro ve hedef önerileri', en: 'Nutrition coach: macro and goal advice' },
  { icon: 'flash-outline', tr: 'WSJF ile AI destekli görev önceliklendirme', en: 'AI-assisted WSJF task prioritisation' },
  { icon: 'calendar-outline', tr: 'Günlük planı AI ile oluştur ve düzenle', en: 'Build and adjust your daily plan with AI' },
  { icon: 'barbell-outline', tr: 'Antrenman programı önerileri', en: 'Workout programme suggestions' },
]

export default function PaywallScreen() {
  const { colors, isDark } = useTheme()
  const { lang } = useLang()
  const subscription = useSubscriptionStatus()
  const tr = lang === 'tr'

  const [plans, setPlans] = useState<ProPlan[] | null>(null)
  const [selected, setSelected] = useState<ProPeriod>('annual')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void fetchProPlans().then((result) => {
      if (!active) return
      setPlans(result)
      if (result.length > 0 && !result.some((p) => p.period === 'annual')) setSelected(result[0]!.period)
    })
    return () => {
      active = false
    }
  }, [])

  const openLink = useCallback((url: string) => {
    void WebBrowser.openBrowserAsync(url)
  }, [])

  async function handlePurchase() {
    const plan = plans?.find((p) => p.period === selected)
    if (!plan) return

    setBusy(true)
    const outcome = await purchasePlan(plan)
    setBusy(false)

    if (outcome === 'purchased') {
      await subscription.refresh()
      // Webhook `subscriptions` satırını yazana kadar bekle; edge function'lar
      // yalnızca o satıra bakıyor, yoksa AI özellikleri 402 döner.
      // Yetişmese de satın alma geçerli — kullanıcıya başarı gösteririz.
      await subscription.waitForBackendSync()
      Alert.alert(
        tr ? 'Teşekkürler' : 'Thank you',
        tr ? 'Pro üyeliğin aktif. AI özellikleri açıldı.' : 'Your Pro membership is active. AI features are unlocked.',
        [{ text: tr ? 'Devam' : 'Continue', onPress: () => router.back() }],
      )
    } else if (outcome === 'error') {
      Alert.alert(tr ? 'Satın alma tamamlanamadı' : 'Purchase failed', tr ? 'Lütfen tekrar dene.' : 'Please try again.')
    } else if (outcome === 'unavailable') {
      Alert.alert(tr ? 'Kullanılamıyor' : 'Unavailable', tr ? 'Satın alma bu sürümde açık değil.' : 'Purchases are not available in this build.')
    }
  }

  async function handleRestore() {
    setBusy(true)
    const outcome = await restorePurchases()
    setBusy(false)

    if (outcome === 'restored') {
      await subscription.refresh()
      await subscription.waitForBackendSync()
      Alert.alert(
        tr ? 'Geri yüklendi' : 'Restored',
        tr ? 'Pro üyeliğin geri yüklendi.' : 'Your Pro membership has been restored.',
        [{ text: tr ? 'Devam' : 'Continue', onPress: () => router.back() }],
      )
    } else if (outcome === 'nothing') {
      Alert.alert(tr ? 'Kayıt bulunamadı' : 'Nothing to restore', tr ? 'Bu hesapta aktif bir Pro aboneliği bulunamadı.' : 'No active Pro subscription found for this account.')
    } else {
      Alert.alert(tr ? 'Geri yükleme başarısız' : 'Restore failed', tr ? 'Lütfen tekrar dene.' : 'Please try again.')
    }
  }

  const monthly = plans?.find((p) => p.period === 'monthly')
  const annual = plans?.find((p) => p.period === 'annual')

  // Yıllık tasarruf yalnızca iki fiyat da gerçekten store'dan geldiyse gösterilir
  let savingPercent: number | null = null
  if (monthly && annual) {
    const monthlyYear = monthly.product?.price * 12
    const annualPrice = annual.product?.price
    if (monthlyYear > 0 && annualPrice > 0 && annualPrice < monthlyYear) {
      savingPercent = Math.round((1 - annualPrice / monthlyYear) * 100)
    }
  }

  const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play'
  const renewalNotice = tr
    ? `Abonelik otomatik olarak yenilenir. Ödeme, satın alma onaylandığında ${storeName} hesabına yansıtılır. Mevcut dönem bitmeden en az 24 saat önce iptal edilmezse aynı tutarla yenilenir. Aboneliğini ${storeName} hesap ayarlarından yönetebilir veya iptal edebilirsin.`
    : `Your subscription renews automatically. Payment is charged to your ${storeName} account when the purchase is confirmed. It renews at the same price unless cancelled at least 24 hours before the current period ends. You can manage or cancel it in your ${storeName} account settings.`

  return (
    <ScreenBackground>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing[5], paddingTop: spacing[2] }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel={tr ? 'Kapat' : 'Close'}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing[5], paddingBottom: spacing[10] }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', marginBottom: spacing[6] }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: `${palette.accent}18`, borderWidth: 1.5, borderColor: `${palette.accent}35`, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[4] }}>
            <Ionicons name="sparkles" size={30} color={palette.accent} />
          </View>
          <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, textAlign: 'center' }}>
            LifeOS Pro
          </Text>
          <Text style={{ fontSize: fontSize.base, color: colors.textMuted, textAlign: 'center', marginTop: spacing[2] }}>
            {tr ? 'AI destekli beslenme, planlama ve antrenman özelliklerinin tamamı' : 'Every AI-powered nutrition, planning and workout feature'}
          </Text>
        </View>

        <GlassCard style={{ marginBottom: spacing[5] }}>
          {BENEFITS.map((benefit, index) => (
            <View
              key={benefit.icon}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border }}
            >
              <Ionicons name={benefit.icon} size={20} color={palette.accent} />
              <Text style={{ flex: 1, fontSize: fontSize.base, color: colors.textSecondary }}>
                {tr ? benefit.tr : benefit.en}
              </Text>
            </View>
          ))}
        </GlassCard>

        {subscription.isPro ? (
          <GlassCard style={{ marginBottom: spacing[5] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
              <Ionicons name="checkmark-circle" size={24} color={palette.success} />
              <Text style={{ flex: 1, fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                {tr ? 'Pro üyeliğin zaten aktif' : 'Your Pro membership is already active'}
              </Text>
            </View>
          </GlassCard>
        ) : plans === null ? (
          <View style={{ paddingVertical: spacing[8], alignItems: 'center' }}>
            <ActivityIndicator color={palette.accent} />
          </View>
        ) : plans.length === 0 ? (
          <GlassCard style={{ marginBottom: spacing[5] }}>
            <Text style={{ fontSize: fontSize.base, color: colors.textSecondary, textAlign: 'center' }}>
              {tr ? 'Abonelik seçenekleri şu anda yüklenemedi. Lütfen daha sonra tekrar dene.' : 'Subscription options could not be loaded right now. Please try again later.'}
            </Text>
          </GlassCard>
        ) : (
          <View style={{ gap: spacing[3], marginBottom: spacing[5] }}>
            {plans.map((plan) => {
              const active = plan.period === selected
              const title = plan.period === 'monthly' ? (tr ? 'Aylık' : 'Monthly') : (tr ? 'Yıllık' : 'Annual')
              const per = plan.period === 'monthly' ? (tr ? '/ ay' : '/ month') : (tr ? '/ yıl' : '/ year')

              return (
                <TouchableOpacity
                  key={plan.productId}
                  onPress={() => setSelected(plan.period)}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing[3],
                    padding: spacing[4],
                    borderRadius: radius.xl,
                    borderWidth: 1.5,
                    borderColor: active ? palette.accent : colors.border,
                    backgroundColor: active ? `${palette.accent}12` : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.55)'),
                  }}
                >
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={active ? palette.accent : colors.textSubtle}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                      <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{title}</Text>
                      {plan.period === 'annual' && savingPercent !== null && (
                        <View style={{ paddingHorizontal: spacing[2], paddingVertical: 3, borderRadius: radius.full, backgroundColor: `${palette.success}18`, borderWidth: 1, borderColor: `${palette.success}35` }}>
                          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: palette.success }}>
                            %{savingPercent} {tr ? 'tasarruf' : 'off'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
                      {tr ? 'Otomatik yenilenir, istediğin zaman iptal et' : 'Auto-renews, cancel anytime'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>
                    {plan.priceString}
                    <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.regular, color: colors.textMuted }}> {per}</Text>
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {!subscription.isPro && (
          <Button
            label={tr ? 'Pro üyeliği başlat' : 'Start Pro membership'}
            onPress={() => void handlePurchase()}
            size="lg"
            fullWidth
            loading={busy}
            disabled={busy || !plans || plans.length === 0}
            style={{ marginBottom: spacing[3] }}
          />
        )}

        <Button
          label={tr ? 'Satın alımları geri yükle' : 'Restore purchases'}
          onPress={() => void handleRestore()}
          variant="ghost"
          fullWidth
          disabled={busy}
          style={{ marginBottom: spacing[5] }}
        />

        <Text style={{ fontSize: fontSize.xs, lineHeight: 17, color: colors.textSubtle, textAlign: 'center', marginBottom: spacing[4] }}>
          {renewalNotice}
        </Text>

        <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing[4] }}>
          <TouchableOpacity onPress={() => openLink(EULA_URL)}>
            <Text style={{ fontSize: fontSize.xs, color: palette.accent, textDecorationLine: 'underline' }}>
              {tr ? 'Kullanım Koşulları' : 'Terms of Use'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openLink(PRIVACY_URL)}>
            <Text style={{ fontSize: fontSize.xs, color: palette.accent, textDecorationLine: 'underline' }}>
              {tr ? 'Gizlilik Politikası' : 'Privacy Policy'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openLink(TERMS_URL)}>
            <Text style={{ fontSize: fontSize.xs, color: palette.accent, textDecorationLine: 'underline' }}>
              {tr ? 'Satış Sözleşmesi' : 'Sales Agreement'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenBackground>
  )
}
