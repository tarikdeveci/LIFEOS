import { useMemo, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import {
  muscleBalance,
  muscleFatigue,
  muscleRetention,
  setsInWindow,
  NON_ANATOMICAL_MUSCLE_GROUPS,
} from '@lifeos/shared'
import type {
  LoggedSet,
  MuscleGroup,
  MuscleLevel,
  FatigueState,
} from '@lifeos/shared'
import { GlassCard } from '../ui/GlassCard'
import { MuscleLevelBar } from './MuscleLevelBar'
import { useTheme } from '../../contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  sets: LoggedSet[]
  muscleGroups: MuscleGroup[]
  loading: boolean
  error: string | null
}

type Segment = 'balance' | 'recovery' | 'strength'

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'balance', label: 'Denge' },
  { key: 'recovery', label: 'Toparlanma' },
  { key: 'strength', label: 'Güç' },
]

/** Seviye 0-1 iken uyarı, 2 iken nötr, 3-4 iken olumlu renk. */
function levelColor(level: MuscleLevel): string {
  if (level <= 1) return palette.warning
  if (level === 2) return palette.accent
  return palette.success
}

const FATIGUE_LABEL: Record<FatigueState, string> = {
  ready: 'Hazır',
  recovering: 'Toparlanıyor',
  fatigued: 'Yorgun',
}

const FATIGUE_COLOR: Record<FatigueState, string> = {
  ready: palette.success,
  recovering: palette.warning,
  fatigued: palette.danger,
}

/** "12 gün önce" / "Bugün" / "Dün" — relativeDateLabel'ın gün-sayısı sürümü. */
function daysSinceLabel(days: number): string {
  if (days === 0) return 'Bugün'
  if (days === 1) return 'Dün'
  return `${days} gün önce`
}

/**
 * Kas dengesi, toparlanma ve güç (retansiyon) kartı.
 *
 * Üç segment de aynı 30 günlük `sets` girdisini paylaşır; pencere farkı
 * (denge haftalık, toparlanma/güç 30 gün) burada `setsInWindow` ile
 * uygulanır. Kas grupları veritabanından gelir (`muscleGroups`), sabit
 * kodlanmış bir liste yok — yeni kas grubu eklendiğinde kart otomatik
 * güncellenir.
 */
export function MuscleInsightsCard({ sets, muscleGroups, loading, error }: Props) {
  const { colors } = useTheme()
  const [segment, setSegment] = useState<Segment>('balance')

  const anatomicalGroups = useMemo(
    () => muscleGroups.filter((g) => !NON_ANATOMICAL_MUSCLE_GROUPS.includes(g.name_en)),
    [muscleGroups],
  )

  const balance = useMemo(() => muscleBalance(setsInWindow(sets, 7), muscleGroups), [sets, muscleGroups])
  const fatigue = useMemo(() => muscleFatigue(sets), [sets])
  const retention = useMemo(() => muscleRetention(sets), [sets])

  const hasData = sets.length > 0

  return (
    <GlassCard style={{ marginBottom: spacing[4] }}>
      <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing[3] }}>
        Kas Haritası
      </Text>

      {loading && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2] }}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>Yükleniyor...</Text>
        </View>
      )}

      {!loading && error && (
        <Text style={{ fontSize: fontSize.sm, color: palette.danger }}>Kas verileri yüklenemedi.</Text>
      )}

      {!loading && !error && !hasData && (
        <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
          Antrenman kaydettikçe kas haritan burada oluşacak.
        </Text>
      )}

      {!loading && !error && hasData && (
        <>
          <View style={{ flexDirection: 'row', backgroundColor: colors.glassInner, borderRadius: radius.lg, padding: 4, marginBottom: spacing[4] }}>
            {SEGMENTS.map((s) => (
              <TouchableOpacity
                key={s.key}
                onPress={() => setSegment(s.key)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  backgroundColor: segment === s.key ? colors.bgSurface : 'transparent',
                  ...(segment === s.key ? colors.shadowCard : {}),
                }}
              >
                <Text style={{ fontSize: fontSize.sm, fontWeight: segment === s.key ? fontWeight.semibold : fontWeight.regular, color: segment === s.key ? colors.textPrimary : colors.textMuted }}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {segment === 'balance' && (
            <View>
              {balance.neglected.length > 0 && (
                <Text style={{ fontSize: fontSize.sm, color: palette.warning, fontWeight: fontWeight.medium, marginBottom: spacing[3] }}>
                  Bu hafta ihmal edilen: {balance.neglected.map((g) => g.name).join(', ')}
                </Text>
              )}
              {[...balance.entries]
                .sort((a, b) => a.muscleGroup.name.localeCompare(b.muscleGroup.name, 'tr'))
                .map((entry) => {
                  const neglected = balance.neglected.some((g) => g.id === entry.muscleGroup.id)
                  return (
                    <View key={entry.muscleGroup.id} style={{ marginBottom: spacing[3] }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: neglected ? palette.warning : colors.textPrimary }}>
                          {entry.muscleGroup.name}
                        </Text>
                        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>
                          {entry.effectiveSets.toFixed(1)} set
                        </Text>
                      </View>
                      <MuscleLevelBar fraction={entry.level / 4} color={levelColor(entry.level)} trackColor={colors.glassInner} />
                    </View>
                  )
                })}
            </View>
          )}

          {segment === 'recovery' && (
            <View>
              {Object.entries(fatigue)
                .map(([id, f]) => ({ group: muscleGroups.find((g) => g.id === Number(id)) ?? null, fatigue: f }))
                .filter((row): row is { group: MuscleGroup; fatigue: (typeof fatigue)[number] } => row.group !== null)
                .sort((a, b) => a.group.name.localeCompare(b.group.name, 'tr'))
                .map(({ group, fatigue: f }) => (
                  <View key={group.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{group.name}</Text>
                    <View style={{ paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, backgroundColor: `${FATIGUE_COLOR[f.state]}18` }}>
                      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: FATIGUE_COLOR[f.state] }}>
                        {FATIGUE_LABEL[f.state]}
                      </Text>
                    </View>
                  </View>
                ))}
              {Object.keys(fatigue).length === 0 && (
                <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>Son 30 günde çalışılmış kas yok.</Text>
              )}
            </View>
          )}

          {segment === 'strength' && (
            <View>
              {anatomicalGroups
                .map((group) => ({ group, r: retention[group.id] ?? null }))
                .sort((a, b) => {
                  const aTrained = a.r?.lastTrainedAt != null
                  const bTrained = b.r?.lastTrainedAt != null
                  if (aTrained !== bTrained) return aTrained ? -1 : 1
                  return a.group.name.localeCompare(b.group.name, 'tr')
                })
                .map(({ group, r }) => {
                  const trained = r?.lastTrainedAt != null && r.daysSince != null
                  // retention.value 0.5..1 arası: 1 tam korunmuş, düşük değer
                  // güç kaybı riskini temsil ediyor. %5'in altı gürültü.
                  const riskPct = trained ? Math.round((1 - r!.value) * 100) : 0
                  return (
                    <View key={group.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{group.name}</Text>
                      {trained ? (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{daysSinceLabel(r!.daysSince as number)}</Text>
                          {riskPct >= 5 && (
                            <Text style={{ fontSize: fontSize.xs, color: palette.warning, marginTop: 2 }}>%{riskPct} düşüş riski</Text>
                          )}
                        </View>
                      ) : (
                        <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle }}>Henüz çalışılmadı</Text>
                      )}
                    </View>
                  )
                })}
            </View>
          )}
        </>
      )}
    </GlassCard>
  )
}
