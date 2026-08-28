import { useEffect, useState } from 'react'
import { Platform, View, Text, TouchableOpacity } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Ionicons from '@expo/vector-icons/Ionicons'
import {
  activityLevelFromSteps,
  energyFromSleep,
  goalProgress,
  recoverySignal,
  summarizeHealthDays,
  formatSteps,
  formatDistance,
  formatSleepDuration,
  todayDate,
  type HealthDaily,
  type HealthSettings,
} from '@lifeos/shared'
import { GlassCard } from '../ui/GlassCard'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  today: HealthDaily | null
  range: HealthDaily[]
  settings: HealthSettings
  isSyncing: boolean
  onSync: () => void
}

/** Kart açık mı kapalı mı — cihazda kalıcı, varsayılan kapalı. */
const COLLAPSE_KEY = 'lifeos_health_card_expanded'

/**
 * Today ekranındaki sağlık özeti kartı.
 * Sadece sağlık senkronu açıkken (settings.enabled) gösterilmeli.
 */
export function HealthCard({ today, range, settings, isSyncing, onSync }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const providerName = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'
  // Kart tüm ekranı kaplamasın: varsayılan kapalı, tercih cihazda saklanır.
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let active = true
    AsyncStorage.getItem(COLLAPSE_KEY)
      .then((stored) => { if (active && stored === '1') setExpanded(true) })
      .catch(() => { /* tercih okunamazsa kapalı kalır */ })
    return () => { active = false }
  }, [])

  function toggle() {
    setExpanded((current) => {
      const next = !current
      void AsyncStorage.setItem(COLLAPSE_KEY, next ? '1' : '0').catch(() => {})
      return next
    })
  }

  const steps = today?.steps ?? null
  const stepProgress = goalProgress(steps, settings.step_goal)
  const sleepProgress = goalProgress(today?.sleep_minutes ?? null, settings.sleep_goal_minutes)
  const recovery = recoverySignal(range, todayDate())
  const suggestedEnergy = energyFromSleep(today?.sleep_minutes ?? null, settings.sleep_goal_minutes)
  const weekly = summarizeHealthDays(range)
  const observedActivity = activityLevelFromSteps(weekly.averageSteps)
  const activityLabel = observedActivity
    ? {
        sedentary: t.activity_sedentary,
        lightly_active: t.activity_lightly,
        moderately_active: t.activity_moderately,
        very_active: t.activity_very,
        extra_active: t.activity_extra,
      }[observedActivity]
    : null

  const hasAnyData =
    today &&
    (today.steps !== null ||
      today.distance_m !== null ||
      today.active_energy_kcal !== null ||
      today.exercise_minutes !== null ||
      today.workout_count !== null ||
      today.sleep_minutes !== null ||
      today.resting_heart_rate !== null ||
      today.avg_heart_rate !== null)

  // Kapalı hâlin tek satırı: günün en çok bakılan üç değeri.
  const collapsedSummary = [
    steps !== null ? `${formatSteps(steps, lang)} ${t.health_steps.toLowerCase()}` : null,
    today?.active_energy_kcal != null ? `${Math.round(today.active_energy_kcal)} kcal` : null,
    today?.sleep_minutes != null ? formatSleepDuration(today.sleep_minutes, lang) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <GlassCard style={{ marginBottom: spacing[4] }}>
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: expanded || !hasAnyData ? spacing[4] : 0 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flex: 1 }}>
          <Ionicons name="heart-outline" size={18} color={palette.danger} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{providerName}</Text>
            {/* Kapalıyken başlığın altı özetin kendisi olur; kart tek satıra iner. */}
            <Text style={{ marginTop: 1, fontSize: fontSize.xs, color: colors.textSubtle }} numberOfLines={1}>
              {expanded || !hasAnyData ? t.health_summary : collapsedSummary}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onSync} disabled={isSyncing} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={isSyncing ? 'sync' : 'sync-outline'} size={18} color={isSyncing ? colors.textSubtle : palette.accent} />
        </TouchableOpacity>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textSubtle}
          style={{ marginLeft: spacing[3] }}
        />
      </TouchableOpacity>

      {!expanded && hasAnyData ? null : !hasAnyData ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[3] }}>
          {t.health_no_data}
        </Text>
      ) : (
        <>
          {/* Adım hedef halkası + metrikler */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4], marginBottom: spacing[4] }}>
            <StepRing progress={stepProgress?.progress ?? 0} reached={stepProgress?.reached ?? false} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>
                {formatSteps(steps, lang)}
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
                {t.health_steps} · {t.health_step_goal.toLowerCase()} {formatSteps(settings.step_goal, lang)}
              </Text>
              {stepProgress?.reached && (
                <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full, backgroundColor: `${palette.success}1F` }}>
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: palette.success }}>{t.health_goal_reached}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Metrik ızgarası */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <HealthMetric icon="footsteps-outline" color={palette.info} label={t.health_distance} value={formatDistance(today?.distance_m ?? null, lang)} />
            <HealthMetric icon="flame-outline" color={palette.warning} label={t.health_active_energy} value={today?.active_energy_kcal != null ? `${Math.round(today.active_energy_kcal)} kcal` : '–'} />
            <HealthMetric icon="timer-outline" color={palette.success} label={t.health_exercise_minutes} value={today?.exercise_minutes != null ? `${Math.round(today.exercise_minutes)} min` : '–'} />
            <HealthMetric icon="barbell-outline" color={palette.workout} label={t.health_workouts} value={today?.workout_count != null ? `${today.workout_count}` : '–'} />
            <HealthMetric
              icon="moon-outline"
              color={palette.deferred}
              label={t.health_sleep}
              value={formatSleepDuration(today?.sleep_minutes ?? null, lang)}
              sub={sleepProgress?.reached ? '✓' : undefined}
            />
            <HealthMetric
              icon="pulse-outline"
              color={palette.danger}
              label={t.health_resting_hr}
              value={today?.resting_heart_rate != null ? `${Math.round(today.resting_heart_rate)} bpm` : '–'}
            />
            <HealthMetric
              icon="heart-circle-outline"
              color={palette.danger}
              label={t.health_avg_hr}
              value={today?.avg_heart_rate != null ? `${Math.round(today.avg_heart_rate)} bpm` : '–'}
            />
          </View>

          {(suggestedEnergy !== null || recovery.status !== 'unknown') && (
            <View style={{ marginTop: spacing[3], gap: spacing[2] }}>
              {suggestedEnergy !== null && (
                <InsightRow
                  icon="battery-half-outline"
                  color={palette.accent}
                  text={`${t.health_energy_suggestion}: ${suggestedEnergy}/5`}
                />
              )}

              {recovery.status !== 'unknown' && (
                <InsightRow
                  icon={recovery.status === 'good' ? 'shield-checkmark-outline' : 'warning-outline'}
                  color={recovery.status === 'good' ? palette.success : palette.warning}
                  text={`${recovery.status === 'good' ? t.health_recovery_good : t.health_recovery_watch}${
                    recovery.deltaBpm != null && recovery.status === 'elevated' ? ` (+${recovery.deltaBpm} bpm)` : ''
                  }`}
                />
              )}
            </View>
          )}

          {weekly.dayCount > 0 && (
            <View
              style={{
                marginTop: spacing[3],
                padding: spacing[3],
                borderRadius: radius.md,
                backgroundColor: colors.glassInner,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[2] }}>
                <Ionicons name="analytics-outline" size={15} color={palette.accent} />
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                  {t.health_weekly_title}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
                <WeeklyMetric label={t.health_weekly_steps} value={formatSteps(weekly.averageSteps, lang)} />
                <WeeklyMetric label={t.health_weekly_sleep} value={formatSleepDuration(weekly.averageSleepMinutes, lang)} />
                <WeeklyMetric label={t.health_weekly_energy} value={`${weekly.totalActiveEnergyKcal} kcal`} />
                <WeeklyMetric label={t.health_workouts} value={`${weekly.totalWorkouts}`} />
              </View>
              {activityLabel && (
                <Text style={{ marginTop: spacing[2], fontSize: fontSize.xs, color: colors.textSecondary }}>
                  {t.health_activity_level}: {activityLabel}
                </Text>
              )}
            </View>
          )}
        </>
      )}
    </GlassCard>
  )
}

function InsightRow({ icon, color, text }: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string }) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        padding: spacing[3],
        borderRadius: radius.md,
        backgroundColor: `${color}12`,
        borderWidth: 1,
        borderColor: `${color}28`,
      }}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text style={{ flex: 1, fontSize: fontSize.xs, color: colors.textSecondary }}>{text}</Text>
    </View>
  )
}

function WeeklyMetric({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme()
  return (
    <View style={{ flexGrow: 1, flexBasis: '46%', paddingVertical: spacing[1] }}>
      <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{label}</Text>
      <Text style={{ marginTop: 1, fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{value}</Text>
    </View>
  )
}

/** SVG olmadan basit hedef halkası — konik izlenimi için iki yarım daire yerine
 *  ilerlemeyi kalınlığı sabit bir yay yerine dolgu yüzdesiyle veriyoruz. */
function StepRing({ progress, reached }: { progress: number; reached: boolean }) {
  const { colors } = useTheme()
  const size = 64
  const ringColor = reached ? palette.success : palette.accent
  const pct = Math.round(progress * 100)

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Dış halka */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 6,
          borderColor: colors.border,
        }}
      />
      {/* İlerleme yayı — üstten başlayan renkli kenarlar */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 6,
          borderColor: 'transparent',
          borderTopColor: ringColor,
          borderRightColor: progress > 0.25 ? ringColor : 'transparent',
          borderBottomColor: progress > 0.5 ? ringColor : 'transparent',
          borderLeftColor: progress > 0.75 ? ringColor : 'transparent',
          transform: [{ rotate: '-45deg' }],
        }}
      />
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: ringColor }}>{pct}%</Text>
    </View>
  )
}

function HealthMetric({
  icon,
  color,
  label,
  value,
  sub,
}: {
  icon: keyof typeof Ionicons.glyphMap
  color: string
  label: string
  value: string
  sub?: string
}) {
  const { colors } = useTheme()
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: '47%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[2],
        padding: spacing[3],
        borderRadius: radius.md,
        backgroundColor: `${color}12`,
        borderWidth: 1,
        borderColor: `${color}22`,
      }}
    >
      <Ionicons name={icon} size={16} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{label}</Text>
        <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>
          {value}
          {sub ? <Text style={{ color: palette.success }}> {sub}</Text> : null}
        </Text>
      </View>
    </View>
  )
}

/**
 * Sağlık senkronu kapalıyken ana ekranda duran giriş noktası.
 * App Store Guideline 2.5.1: HealthKit kullanımı, izin istenmeden önce de
 * arayüzde açıkça görünmeli. Profile sekmesi tab bar'da gizli olduğu için
 * (href: null) tanıtımın Today ekranında da bulunması gerekiyor.
 */
export function HealthConnectPrompt({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme()
  const { t } = useLang()
  const providerName = Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t.health_connect.replace('{provider}', providerName)}
    >
      <GlassCard style={{ marginBottom: spacing[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: radius.md,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: `${palette.danger}14`,
            }}
          >
            <Ionicons name="heart-outline" size={19} color={palette.danger} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary }}>
              {providerName}
            </Text>
            <Text style={{ marginTop: 2, fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 17 }}>
              {t.health_prompt_desc.replace('{provider}', providerName)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
        </View>
      </GlassCard>
    </TouchableOpacity>
  )
}
