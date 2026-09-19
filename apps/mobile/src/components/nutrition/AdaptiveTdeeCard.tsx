import { useState } from 'react'
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import {
  formatWeightKg,
  relativeDateLabel,
  todayDate,
  TDEE_MIN_DAYS,
  TDEE_MIN_INTAKE_DAYS,
  TDEE_MIN_WEIGH_INS,
} from '@lifeos/shared'
import type { AdaptiveTdeeResult, HealthSource, TdeeGap } from '@lifeos/shared'
import type { WeightPoint } from '@lifeos/shared/supabase'
import { GlassCard } from '../ui/GlassCard'
import { Button } from '../ui/Button'
import { WeightChart } from './WeightChart'
import { WeightEntry } from './WeightEntry'
import { useWeightTracking } from '../../hooks/useWeightTracking'
import { useTheme } from '../../contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  userId: string
  /** Hedef değişince beslenme ekranının kendi hedefini tazelemesi için. */
  onTargetChanged: () => void
}

const RANGES = [30, 90] as const
type Range = (typeof RANGES)[number]

/** Geçmiş listesinde kapalıyken görünen tartı sayısı. */
const HISTORY_PREVIEW = 5

const SOURCE_LABEL: Record<HealthSource, string> = {
  manual: 'Elle',
  health_connect: 'Health Connect',
  apple_health: 'Apple Sağlık',
}

function gapText(gap: TdeeGap, r: AdaptiveTdeeResult): string {
  switch (gap) {
    case 'no_weigh_in':
      return 'Tartıldıkça kalori hedefin gerçek harcamana göre ayarlanır.'
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

/** +0,3 / -0,2 / 0,0: önceki tartıya göre fark. */
function signedKg(delta: number): string {
  const rounded = Math.round(delta * 10) / 10
  return `${rounded > 0 ? '+' : rounded < 0 ? '-' : ''}${formatWeightKg(Math.abs(rounded))}`
}

/**
 * Kilo takibi ve adaptif kalori hedefi: güncel kilo, trend grafiği, günün
 * tartısı, tartı geçmişi ve bunlardan tahmin edilen gerçek harcama
 * (utils/adaptiveTdee.ts). Tartı Apple Health/Health Connect'ten gelir;
 * cihazı olmayan kullanıcı burada elle girer.
 */
export function AdaptiveTdeeCard({ userId, onTargetChanged }: Props) {
  const { colors } = useTheme()
  const { state, busy, saveWeight, removeWeight, applyProposal } = useWeightTracking(userId, onTargetChanged)
  const [range, setRange] = useState<Range>(30)
  const [historyOpen, setHistoryOpen] = useState(false)

  const today = todayDate()
  const data = state.status === 'ready' ? state.data : null
  const weighIns = data?.weighIns ?? []
  const latest: WeightPoint | null = weighIns[weighIns.length - 1] ?? null
  const savedToday = latest?.date === today
  const history = [...weighIns].reverse()
  const visibleHistory = historyOpen ? history : history.slice(0, HISTORY_PREVIEW)

  return (
    <GlassCard style={{ marginBottom: spacing[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] }}>
        <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>Kilo Takibi</Text>
        {weighIns.length > 0 && (
          <View style={{ flexDirection: 'row', backgroundColor: colors.glassInner, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, padding: 2 }}>
            {RANGES.map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => setRange(r)}
                style={{ paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, backgroundColor: range === r ? palette.accent : 'transparent' }}
              >
                <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: range === r ? '#FFFFFF' : colors.textMuted }}>{r} gün</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {state.status === 'loading' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>Yükleniyor...</Text>
        </View>
      )}

      {state.status === 'error' && (
        <Text style={{ fontSize: fontSize.sm, color: palette.danger }}>Kilo verileri yüklenemedi: {state.message}</Text>
      )}

      {data && (
        <View style={{ gap: spacing[4] }}>
          {latest ? (
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>
                  {formatWeightKg(latest.weightKg)}
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textMuted }}> kg</Text>
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                  Son tartı: {relativeDateLabel(latest.date)}
                  {data.result.trendWeightKg !== null ? `, trend ${formatWeightKg(data.result.trendWeightKg)} kg` : ''}
                </Text>
              </View>
              {data.result.weeklyRateKg !== null && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radius.full, backgroundColor: `${palette.accent}14` }}>
                  <Ionicons
                    name={data.result.weeklyRateKg > 0.05 ? 'trending-up' : data.result.weeklyRateKg < -0.05 ? 'trending-down' : 'remove'}
                    size={14}
                    color={palette.accent}
                  />
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>
                    haftada {signedKg(data.result.weeklyRateKg)} kg
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
              Henüz tartı yok. İlk tartını gir, kilonun gidişatı burada grafik olarak birikir.
            </Text>
          )}

          {latest && <WeightChart points={weighIns} trend={data.result.trend} days={range} endDate={today} />}

          <WeightEntry
            key={latest ? `${latest.date}:${latest.weightKg}` : `profile:${data.profileWeightKg ?? ''}`}
            initialKg={latest?.weightKg ?? data.profileWeightKg}
            savedToday={savedToday}
            saving={busy === 'save'}
            disabled={busy !== null && busy !== 'save'}
            onSave={saveWeight}
          />

          {history.length > 0 && (
            <View>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[1] }}>
                Tartı geçmişi
              </Text>
              {visibleHistory.map((entry, index) => {
                const previous = history[index + 1]
                const label = relativeDateLabel(entry.date)
                return (
                  <View key={entry.date} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{label}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{SOURCE_LABEL[entry.source]}</Text>
                    </View>
                    {previous && (
                      <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginRight: spacing[3], fontVariant: ['tabular-nums'] }}>
                        {signedKg(entry.weightKg - previous.weightKg)}
                      </Text>
                    )}
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>
                      {formatWeightKg(entry.weightKg)} kg
                    </Text>
                    {entry.source === 'manual' ? (
                      <TouchableOpacity
                        onPress={() => removeWeight(entry.date, label)}
                        disabled={busy !== null}
                        accessibilityLabel={`${label} tartısını sil`}
                        hitSlop={8}
                        style={{ marginLeft: spacing[3] }}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.textSubtle} />
                      </TouchableOpacity>
                    ) : (
                      <View style={{ width: 16, marginLeft: spacing[3] }} />
                    )}
                  </View>
                )
              })}
              {history.length > HISTORY_PREVIEW && (
                <TouchableOpacity
                  onPress={() => setHistoryOpen((open) => !open)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], paddingTop: spacing[3] }}
                >
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: palette.accent }}>
                    {historyOpen ? 'Daha az göster' : `Tümünü göster (${history.length})`}
                  </Text>
                  <Ionicons name={historyOpen ? 'chevron-up' : 'chevron-down'} size={16} color={palette.accent} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing[3], gap: spacing[2] }}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>Gerçek harcaman</Text>
            {data.result.weighIns > 0 && (
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
                Tahmini {data.result.expenditure} kcal/gün ({data.result.low}-{data.result.high})
              </Text>
            )}
            {data.result.proposal ? (
              <>
                <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{data.result.proposal.reason}</Text>
                <Button
                  label={busy === 'apply' ? 'Güncelleniyor...' : `Hedefi ${data.result.proposal.calories} kcal yap`}
                  onPress={() => {
                    if (data.result.proposal) applyProposal(data.result.proposal)
                  }}
                  loading={busy === 'apply'}
                  disabled={busy !== null}
                  fullWidth
                />
              </>
            ) : (
              data.result.gap && (
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{gapText(data.result.gap, data.result)}</Text>
              )
            )}
          </View>
        </View>
      )}
    </GlassCard>
  )
}
