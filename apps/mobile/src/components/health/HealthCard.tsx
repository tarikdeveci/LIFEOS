import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import {
  goalProgress,
  recoverySignal,
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

/**
 * Today ekranındaki sağlık özeti kartı.
 * Sadece sağlık senkronu açıkken (settings.enabled) gösterilmeli.
 */
export function HealthCard({ today, range, settings, isSyncing, onSync }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()

  const steps = today?.steps ?? null
  const stepProgress = goalProgress(steps, settings.step_goal)
  const sleepProgress = goalProgress(today?.sleep_minutes ?? null, settings.sleep_goal_minutes)
  const recovery = recoverySignal(range, todayDate())

  const hasAnyData =
    today &&
    (today.steps !== null ||
      today.active_energy_kcal !== null ||
      today.sleep_minutes !== null ||
      today.resting_heart_rate !== null)

  return (
    <GlassCard style={{ marginBottom: spacing[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Ionicons name="heart-outline" size={18} color={palette.danger} />
          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.health_title}</Text>
        </View>
        <TouchableOpacity onPress={onSync} disabled={isSyncing} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={isSyncing ? 'sync' : 'sync-outline'} size={18} color={isSyncing ? colors.textSubtle : palette.accent} />
        </TouchableOpacity>
      </View>

      {!hasAnyData ? (
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
            <HealthMetric icon="flame-outline" color={palette.warning} label={t.health_active_energy} value={today?.active_energy_kcal != null ? `${Math.round(today.active_energy_kcal)}` : '–'} />
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
              value={today?.resting_heart_rate != null ? `${Math.round(today.resting_heart_rate)}` : '–'}
            />
          </View>

          {/* Toparlanma sinyali */}
          {recovery.status !== 'unknown' && (
            <View
              style={{
                marginTop: spacing[3],
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing[2],
                padding: spacing[3],
                borderRadius: radius.md,
                backgroundColor: recovery.status === 'good' ? `${palette.success}12` : `${palette.warning}12`,
                borderWidth: 1,
                borderColor: recovery.status === 'good' ? `${palette.success}28` : `${palette.warning}28`,
              }}
            >
              <Ionicons
                name={recovery.status === 'good' ? 'shield-checkmark-outline' : 'warning-outline'}
                size={16}
                color={recovery.status === 'good' ? palette.success : palette.warning}
              />
              <Text style={{ flex: 1, fontSize: fontSize.xs, color: colors.textSecondary }}>
                {recovery.status === 'good' ? t.health_recovery_good : t.health_recovery_watch}
                {recovery.deltaBpm != null && recovery.status === 'elevated' ? ` (+${recovery.deltaBpm} bpm)` : ''}
              </Text>
            </View>
          )}
        </>
      )}
    </GlassCard>
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
