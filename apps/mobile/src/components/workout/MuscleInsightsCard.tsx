import { useMemo, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import {
  muscleBalance,
  muscleFatigue,
  muscleRetention,
  setsInWindow,
  FATIGUE_WINDOW_DAYS,
  NON_ANATOMICAL_MUSCLE_GROUPS,
  RETENTION_WINDOW_DAYS,
} from '@lifeos/shared'
import type { LoggedSet, MuscleGroup, MuscleLevel, FatigueState, MuscleRetention } from '@lifeos/shared'
import { GlassCard } from '../ui/GlassCard'
import { MuscleLevelBar } from './MuscleLevelBar'
import { MuscleBodyMap, bodyBaseFill, type BodyMapLegendItem } from './MuscleBodyMap'
import { useTheme } from '../../contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  sets: LoggedSet[]
  muscleGroups: MuscleGroup[]
  /** Vücut ağırlığı hareketlerinin yorgunluk yükü için; null ise 75 kg varsayılır. */
  bodyWeightKg: number | null
  /** Figür için; null ise erkek figürü. */
  gender: 'male' | 'female' | null
  loading: boolean
  error: string | null
}

type Segment = 'balance' | 'recovery' | 'strength'

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'balance', label: 'Denge' },
  { key: 'recovery', label: 'Toparlanma' },
  { key: 'strength', label: 'Güç' },
]

/** Haftalık hacim ölçeği: seviye 1 (az) → 4 (en çok çalışılan kasa yakın). */
const BALANCE_RAMP: Record<Exclude<MuscleLevel, 0>, string> = {
  1: '#C7D2FE',
  2: '#A5B4FC',
  3: '#818CF8',
  4: '#6366F1',
}

/** Seviye 0-1 iken uyarı, 2 iken nötr, 3-4 iken olumlu renk (liste çubukları). */
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

/** retention.value 0.5..1 arası; düşüş riski yüzdesi. %5'in altı gürültü. */
function riskPctOf(r: MuscleRetention): number {
  return Math.round((1 - r.value) * 100)
}

function strengthColor(riskPct: number): string {
  if (riskPct < 5) return palette.success
  if (riskPct < 25) return palette.warning
  return palette.danger
}

/** "12 gün önce", "Bugün", "Dün": relativeDateLabel'ın gün sayısı alan sürümü. */
function daysSinceLabel(days: number): string {
  if (days === 0) return 'Bugün'
  if (days === 1) return 'Dün'
  return `${days} gün önce`
}

function formatSets(value: number): string {
  return value.toFixed(1).replace('.', ',')
}

/**
 * Kas dengesi, toparlanma ve güç (retansiyon) kartı: renkli anatomi figürü,
 * dokunulan kasın ayrıntısı ve açılır tam liste.
 *
 * Üç segment de aynı 60 günlük `sets` girdisini paylaşır; pencere farkı
 * (denge haftalık, toparlanma 30 gün, güç 60 gün) burada `setsInWindow` ya da
 * fonksiyonun kendisi tarafından uygulanır. Kas grupları veritabanından gelir
 * (`muscleGroups`), sabit kodlanmış bir liste yok.
 */
export function MuscleInsightsCard({ sets, muscleGroups, bodyWeightKg, gender, loading, error }: Props) {
  const { colors, isDark } = useTheme()
  const [segment, setSegment] = useState<Segment>('balance')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [listOpen, setListOpen] = useState(false)

  const anatomicalGroups = useMemo(
    () => muscleGroups.filter((g) => !NON_ANATOMICAL_MUSCLE_GROUPS.includes(g.name_en)),
    [muscleGroups],
  )

  const balance = useMemo(() => muscleBalance(setsInWindow(sets, 7), muscleGroups), [sets, muscleGroups])
  const fatigue = useMemo(() => muscleFatigue(sets, new Date(), { bodyWeightKg }), [sets, bodyWeightKg])
  const retention = useMemo(() => muscleRetention(sets), [sets])

  const baseFill = bodyBaseFill(isDark)

  const { fills, legend } = useMemo((): { fills: Record<number, string>; legend: BodyMapLegendItem[] } => {
    const out: Record<number, string> = {}
    if (segment === 'balance') {
      for (const entry of balance.entries) {
        if (entry.level > 0) out[entry.muscleGroup.id] = BALANCE_RAMP[entry.level as Exclude<MuscleLevel, 0>]
      }
      return {
        fills: out,
        legend: [
          { color: baseFill, label: 'Yok' },
          { color: BALANCE_RAMP[1], label: 'Az' },
          { color: BALANCE_RAMP[4], label: 'En çok' },
        ],
      }
    }
    if (segment === 'recovery') {
      for (const [id, f] of Object.entries(fatigue)) out[Number(id)] = FATIGUE_COLOR[f.state]
      return {
        fills: out,
        legend: [
          { color: palette.success, label: FATIGUE_LABEL.ready },
          { color: palette.warning, label: FATIGUE_LABEL.recovering },
          { color: palette.danger, label: FATIGUE_LABEL.fatigued },
          { color: baseFill, label: `${FATIGUE_WINDOW_DAYS} günde yok` },
        ],
      }
    }
    for (const [id, r] of Object.entries(retention)) {
      if (r.lastTrainedAt != null) out[Number(id)] = strengthColor(riskPctOf(r))
    }
    return {
      fills: out,
      legend: [
        { color: palette.success, label: 'Korunuyor' },
        { color: palette.warning, label: 'Düşüş başladı' },
        { color: palette.danger, label: 'Yüksek risk' },
        { color: baseFill, label: `${RETENTION_WINDOW_DAYS} günde yok` },
      ],
    }
  }, [segment, balance, fatigue, retention, baseFill])

  const selectedGroup = selectedId !== null ? muscleGroups.find((g) => g.id === selectedId) ?? null : null

  function detailOf(group: MuscleGroup): string {
    if (segment === 'balance') {
      const entry = balance.entries.find((e) => e.muscleGroup.id === group.id)
      const value = entry?.effectiveSets ?? 0
      if (value === 0) return 'Bu hafta çalışılmadı'
      const neglected = balance.neglected.some((g) => g.id === group.id)
      return `Bu hafta ${formatSets(value)} etkili set${neglected ? ', ihmal ediliyor' : ''}`
    }
    if (segment === 'recovery') {
      const f = fatigue[group.id]
      return f ? FATIGUE_LABEL[f.state] : `Son ${FATIGUE_WINDOW_DAYS} günde çalışılmadı`
    }
    const r = retention[group.id]
    if (!r || r.lastTrainedAt == null || r.daysSince == null) return `Son ${RETENTION_WINDOW_DAYS} günde çalışılmadı`
    const risk = riskPctOf(r)
    return `${daysSinceLabel(r.daysSince)} çalışıldı${risk >= 5 ? `, %${risk} düşüş riski` : ''}`
  }

  const hasData = sets.length > 0
  const emptyNote =
    segment === 'balance' && balance.totalSets === 0
      ? 'Bu hafta çalışılmış kas yok.'
      : segment === 'recovery' && Object.keys(fatigue).length === 0
        ? `Son ${FATIGUE_WINDOW_DAYS} günde çalışılmış kas yok.`
        : null

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

          <MuscleBodyMap
            muscleGroups={anatomicalGroups}
            fills={fills}
            legend={legend}
            gender={gender}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          <View style={{ marginTop: spacing[3], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
            {selectedGroup ? (
              <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>
                <Text style={{ fontWeight: fontWeight.semibold }}>{selectedGroup.name}: </Text>
                {detailOf(selectedGroup)}
              </Text>
            ) : (
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
                {emptyNote ?? 'Ayrıntı için figürde bir kasa dokun.'}
              </Text>
            )}
            {segment === 'balance' && balance.neglected.length > 0 && !selectedGroup && (
              <Text style={{ fontSize: fontSize.xs, color: palette.warning, marginTop: spacing[1] }}>
                Bu hafta ihmal edilen: {balance.neglected.map((g) => g.name).join(', ')}
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={() => setListOpen((open) => !open)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], paddingTop: spacing[3] }}
          >
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: palette.accent }}>
              {listOpen ? 'Listeyi gizle' : 'Tüm kaslar'}
            </Text>
            <Ionicons name={listOpen ? 'chevron-up' : 'chevron-down'} size={16} color={palette.accent} />
          </TouchableOpacity>

          {listOpen && (
            <View style={{ marginTop: spacing[3] }}>
              {segment === 'balance' && [...balance.entries]
                .sort((a, b) => b.effectiveSets - a.effectiveSets || a.muscleGroup.name.localeCompare(b.muscleGroup.name, 'tr'))
                .map((entry) => (
                  <View key={entry.muscleGroup.id} style={{ marginBottom: spacing[3] }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{entry.muscleGroup.name}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>
                        {formatSets(entry.effectiveSets)} set
                      </Text>
                    </View>
                    <MuscleLevelBar fraction={entry.level / 4} color={levelColor(entry.level)} trackColor={colors.glassInner} />
                  </View>
                ))}

              {segment === 'recovery' && muscleGroups
                .filter((group) => fatigue[group.id])
                .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
                .map((group) => {
                  const state = fatigue[group.id]!.state
                  return (
                    <View key={group.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{group.name}</Text>
                      <View style={{ paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, backgroundColor: `${FATIGUE_COLOR[state]}18` }}>
                        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: FATIGUE_COLOR[state] }}>{FATIGUE_LABEL[state]}</Text>
                      </View>
                    </View>
                  )
                })}

              {segment === 'strength' && anatomicalGroups
                .map((group) => ({ group, r: retention[group.id] ?? null }))
                .sort((a, b) => {
                  const aTrained = a.r?.lastTrainedAt != null
                  const bTrained = b.r?.lastTrainedAt != null
                  if (aTrained !== bTrained) return aTrained ? -1 : 1
                  return a.group.name.localeCompare(b.group.name, 'tr')
                })
                .map(({ group, r }) => (
                  <View key={group.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{group.name}</Text>
                    <Text style={{ fontSize: fontSize.xs, color: r?.lastTrainedAt != null ? strengthColor(riskPctOf(r)) : colors.textSubtle }}>
                      {detailOf(group)}
                    </Text>
                  </View>
                ))}
            </View>
          )}
        </>
      )}
    </GlassCard>
  )
}
