import { useCallback, useEffect, useState } from 'react'
import { View, Text, ActivityIndicator, Alert } from 'react-native'
import {
  todayDate,
  TDEE_MIN_DAYS,
  TDEE_MIN_INTAKE_DAYS,
  TDEE_MIN_WEIGH_INS,
} from '@lifeos/shared'
import type { AdaptiveTdeeResult, TdeeGap } from '@lifeos/shared'
import { applyTdeeProposal, loadAdaptiveTdee, upsertWeightLog } from '@lifeos/shared/supabase'
import { GlassCard } from '../ui/GlassCard'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useTheme } from '../../contexts/ThemeContext'
import { supabase } from '../../lib/supabase'
import { palette, fontSize, fontWeight, spacing } from '../../theme/tokens'

interface Props {
  userId: string
  /** Hedef değişince beslenme ekranının kendi hedefini tazelemesi için. */
  onTargetChanged: () => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; result: AdaptiveTdeeResult }

function gapText(gap: TdeeGap, r: AdaptiveTdeeResult): string {
  switch (gap) {
    case 'no_weigh_in':
      return 'Henüz kilo kaydı yok. Tartıldıkça kalori hedefin gerçek harcamana göre ayarlanır.'
    case 'few_days':
      return `Öneri için en az ${TDEE_MIN_DAYS} günlük veri gerekiyor (şu an ${r.daysTracked}).`
    case 'few_intake_days':
      return `Öneri için en az ${TDEE_MIN_INTAKE_DAYS} gün öğün kaydı gerekiyor (şu an ${r.intakeDays}).`
    case 'few_weigh_ins':
      return `Öneri için en az ${TDEE_MIN_WEIGH_INS} tartı gerekiyor (şu an ${r.weighIns}).`
    case 'low_confidence':
      return 'Tahmin henüz oturmadı, birkaç gün daha kayıt gerekiyor.'
    case 'implausible':
      return 'Veriler tutarsız görünüyor, eksik öğün kaydı olabilir. Şimdilik öneri yok.'
    case 'below_floor':
      return 'Hesaplanan hedef güvenli alt sınırın altında kaldı, öneri yok.'
    case 'no_change':
      return 'Mevcut hedefin tahminle uyumlu, değişiklik gerekmiyor.'
  }
}

function formatKg(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace('.', ',')
}

/**
 * Kilo trendi ve öğün kayıtlarından gerçek harcamayı tahmin eder (utils/adaptiveTdee.ts),
 * yeterli veri olunca kalori hedefi önerir. Tartı Apple Health/Health Connect'ten
 * gelir; cihazı olmayan kullanıcı burada elle girer.
 */
export function AdaptiveTdeeCard({ userId, onTargetChanged }: Props) {
  const { colors } = useTheme()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [weightText, setWeightText] = useState('')
  const [busy, setBusy] = useState<'weight' | 'apply' | null>(null)

  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', result: await loadAdaptiveTdee(supabase, userId) })
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : 'Veri okunamadı' })
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSaveWeight() {
    const kg = Number.parseFloat(weightText.replace(',', '.'))
    if (!Number.isFinite(kg)) {
      Alert.alert('Hata', 'Geçerli bir kilo gir.')
      return
    }
    setBusy('weight')
    try {
      await upsertWeightLog(supabase, userId, { date: todayDate(), weight_kg: Math.round(kg * 100) / 100, source: 'manual' })
      setWeightText('')
      await load()
    } catch (err) {
      Alert.alert('Hata', err instanceof Error ? err.message : 'Kilo kaydedilemedi')
    } finally {
      setBusy(null)
    }
  }

  function handleApply(result: AdaptiveTdeeResult) {
    const proposal = result.proposal
    if (!proposal) return
    Alert.alert(
      'Kalori hedefini güncelle',
      `Günlük hedefin ${proposal.calories} kcal olacak (protein ${proposal.protein_g} g, karbonhidrat ${proposal.carbs_g} g, yağ ${proposal.fat_g} g).`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Güncelle',
          onPress: () => {
            void (async () => {
              setBusy('apply')
              try {
                await applyTdeeProposal(supabase, userId, proposal)
                onTargetChanged()
                await load()
              } catch (err) {
                Alert.alert('Hata', err instanceof Error ? err.message : 'Hedef güncellenemedi')
              } finally {
                setBusy(null)
              }
            })()
          },
        },
      ],
    )
  }

  return (
    <GlassCard style={{ marginBottom: spacing[4] }}>
      <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>
        Gerçek Harcaman
      </Text>

      {state.status === 'loading' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>Hesaplanıyor...</Text>
        </View>
      )}

      {state.status === 'error' && (
        <Text style={{ fontSize: fontSize.sm, color: palette.danger }}>Tahmin yüklenemedi: {state.message}</Text>
      )}

      {state.status === 'ready' && (
        <View style={{ gap: spacing[2] }}>
          {state.result.weighIns > 0 && (
            <>
              <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>
                Tahmini harcama: {state.result.expenditure} kcal ({state.result.low}-{state.result.high})
              </Text>
              {state.result.trendWeightKg !== null && (
                <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
                  Trend kilo: {formatKg(state.result.trendWeightKg)} kg
                  {state.result.weeklyRateKg !== null
                    ? `, haftada ${state.result.weeklyRateKg > 0 ? '+' : ''}${formatKg(state.result.weeklyRateKg)} kg`
                    : ''}
                </Text>
              )}
            </>
          )}

          {state.result.proposal ? (
            <View style={{ gap: spacing[2] }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{state.result.proposal.reason}</Text>
              <Button
                label={busy === 'apply' ? 'Güncelleniyor...' : `Hedefi ${state.result.proposal.calories} kcal yap`}
                onPress={() => handleApply(state.result)}
                loading={busy === 'apply'}
                disabled={busy !== null}
                fullWidth
              />
            </View>
          ) : (
            state.result.gap && (
              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{gapText(state.result.gap, state.result)}</Text>
            )
          )}
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2], marginTop: spacing[3] }}>
        <Input
          label="Bugünkü kilon (kg)"
          value={weightText}
          onChangeText={setWeightText}
          keyboardType="decimal-pad"
          placeholder="75,0"
          containerStyle={{ flex: 1 }}
        />
        <Button
          label="Kaydet"
          variant="secondary"
          onPress={() => void handleSaveWeight()}
          loading={busy === 'weight'}
          disabled={busy !== null || !weightText.trim()}
        />
      </View>
    </GlassCard>
  )
}
