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
import { useLang } from '../../contexts/LangContext'
import { useTheme } from '../../contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius, hitSlopFor } from '../../theme/tokens'

interface Props {
  userId: string
  /** Hedef değişince beslenme ekranının kendi hedefini tazelemesi için. */
  onDataChanged: () => void
}

const RANGES = [30, 90] as const
type Range = (typeof RANGES)[number]

/** Geçmiş listesinde kapalıyken görünen tartı sayısı. */
const HISTORY_PREVIEW = 5

const getSourceLabel = (source: HealthSource, t: Record<string, any>) => {
  switch (source) {
    case 'manual': return t.nut_source_manual
    case 'health_connect': return t.nut_source_hc
    case 'apple_health': return t.nut_source_ah
  }
}

function gapText(gap: TdeeGap, r: AdaptiveTdeeResult, t: Record<string, any>): string {
  switch (gap) {
    case 'no_weigh_in':
      return t.nut_gap_no_weigh_in
    case 'few_days':
      return t.nut_gap_few_days.replace('{min}', String(TDEE_MIN_DAYS)).replace('{current}', String(r.daysTracked))
    case 'few_intake_days':
      return t.nut_gap_few_intake.replace('{min}', String(TDEE_MIN_INTAKE_DAYS)).replace('{current}', String(r.intakeDays))
    case 'few_weigh_ins':
      return t.nut_gap_few_weigh.replace('{min}', String(TDEE_MIN_WEIGH_INS)).replace('{current}', String(r.weighIns))
    case 'low_confidence':
      return t.nut_gap_low_conf
    case 'implausible':
      return t.nut_gap_implausible
    case 'below_floor':
      return t.nut_gap_below_floor
    case 'no_change':
      return t.nut_gap_no_change
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
export function AdaptiveTdeeCard({ userId, onDataChanged }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { state, busy, saveWeight, removeWeight, applyProposal } = useWeightTracking(userId, onDataChanged)
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
        <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.nut_adaptive_title}</Text>
        {weighIns.length > 0 && (
          <View style={{ flexDirection: 'row', backgroundColor: colors.glassInner, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, padding: 2 }}>
            {RANGES.map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => setRange(r)}
                style={{ paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, backgroundColor: range === r ? palette.accent : 'transparent' }}
              >
                <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: range === r ? '#FFFFFF' : colors.textMuted }}>{t.nut_adaptive_days.replace('{n}', String(r))}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {state.status === 'loading' && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{t.nut_adaptive_loading}</Text>
        </View>
      )}

      {state.status === 'error' && (
        <Text style={{ fontSize: fontSize.sm, color: palette.danger }}>{t.nut_adaptive_err.replace('{err}', state.message)}</Text>
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
                  {t.nut_adaptive_last.replace('{date}', relativeDateLabel(latest.date))}
                  {data.result.trendWeightKg !== null ? t.nut_adaptive_trend_val.replace('{kg}', formatWeightKg(data.result.trendWeightKg)) : ''}
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
                    {t.nut_adaptive_weekly.replace('{val}', signedKg(data.result.weeklyRateKg))}
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
              {t.nut_adaptive_empty}
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
                {t.nut_adaptive_history}
              </Text>
              {visibleHistory.map((entry, index) => {
                const previous = history[index + 1]
                const label = relativeDateLabel(entry.date)
                return (
                  <View key={entry.date} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{label}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{getSourceLabel(entry.source, t)}</Text>
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
                        accessibilityLabel={t.nut_adaptive_del_a11y.replace('{date}', label)}
                        hitSlop={hitSlopFor(16)}
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
                    {historyOpen ? t.nut_adaptive_show_less : t.nut_adaptive_show_all.replace('{n}', String(history.length))}
                  </Text>
                  <Ionicons name={historyOpen ? 'chevron-up' : 'chevron-down'} size={16} color={palette.accent} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing[3], gap: spacing[2] }}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.nut_adaptive_exp_title}</Text>
            {data.result.weighIns > 0 && (
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
                {t.nut_adaptive_exp_val.replace('{kcal}', String(data.result.expenditure)).replace('{low}', String(data.result.low)).replace('{high}', String(data.result.high))}
              </Text>
            )}
            {data.result.proposal ? (
              <>
                <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{data.result.proposal.reason}</Text>
                <Button
                  label={busy === 'apply' ? t.nut_adaptive_btn_applying : t.nut_adaptive_btn_apply.replace('{kcal}', String(data.result.proposal.calories))}
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
                <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{gapText(data.result.gap, data.result, t)}</Text>
              )
            )}
          </View>
        </View>
      )}
    </GlassCard>
  )
}
