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
import { Segmented } from '../ui/Segmented'
import { MuscleLevelBar } from './MuscleLevelBar'
import { MuscleBodyMap, bodyBaseFill, type BodyMapLegendItem } from './MuscleBodyMap'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import type { Translations } from '../../i18n'
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
  /** Canlı antrenmanda şimdiki hareketin kası: kullanıcı başka kas seçmediyse vurgulanır. */
  focusMuscleId?: number | null
}

type Segment = 'balance' | 'recovery' | 'strength'

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
function daysSinceLabel(days: number, t: Translations): string {
  if (days === 0) return t.muscle_today
  if (days === 1) return t.muscle_yesterday
  return t.muscle_days_ago.replace('{n}', String(days))
}

function formatSets(value: number, lang: string): string {
  const fixed = value.toFixed(1)
  return lang === 'tr' ? fixed.replace('.', ',') : fixed
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
export function MuscleInsightsCard({ sets, muscleGroups, bodyWeightKg, gender, loading, error, focusMuscleId = null }: Props) {
  const { colors, isDark } = useTheme()
  const { t, lang } = useLang()
  const [segment, setSegment] = useState<Segment>('balance')
  const [pickedId, setPickedId] = useState<number | null>(null)
  const selectedId = pickedId ?? focusMuscleId
  const [listOpen, setListOpen] = useState(false)

  const anatomicalGroups = useMemo(
    () => muscleGroups.filter((g) => !NON_ANATOMICAL_MUSCLE_GROUPS.includes(g.name_en)),
    [muscleGroups],
  )

  const balance = useMemo(() => muscleBalance(setsInWindow(sets, 7), muscleGroups), [sets, muscleGroups])
  const fatigue = useMemo(() => muscleFatigue(sets, new Date(), { bodyWeightKg }), [sets, bodyWeightKg])
  const retention = useMemo(() => muscleRetention(sets), [sets])

  const baseFill = bodyBaseFill(isDark)
  const segments: { key: Segment; label: string }[] = [
    { key: 'balance', label: t.muscle_seg_balance },
    { key: 'recovery', label: t.muscle_seg_recovery },
    { key: 'strength', label: t.muscle_seg_strength },
  ]
  const fatigueLabel: Record<FatigueState, string> = {
    ready: t.muscle_ready,
    recovering: t.muscle_recovering,
    fatigued: t.muscle_fatigued,
  }
  // Kas adı veritabanından iki dilde gelir.
  const nameOf = (g: MuscleGroup) => (lang === 'en' ? g.name_en : g.name)
  const byName = (a: MuscleGroup, b: MuscleGroup) => nameOf(a).localeCompare(nameOf(b), lang)

  const { fills, legend } = useMemo((): { fills: Record<number, string>; legend: BodyMapLegendItem[] } => {
    const out: Record<number, string> = {}
    if (segment === 'balance') {
      for (const entry of balance.entries) {
        if (entry.level > 0) out[entry.muscleGroup.id] = BALANCE_RAMP[entry.level as Exclude<MuscleLevel, 0>]
      }
      return {
        fills: out,
        legend: [
          { color: baseFill, label: t.muscle_legend_none },
          { color: BALANCE_RAMP[1], label: t.muscle_legend_low },
          { color: BALANCE_RAMP[4], label: t.muscle_legend_most },
        ],
      }
    }
    if (segment === 'recovery') {
      for (const [id, f] of Object.entries(fatigue)) out[Number(id)] = FATIGUE_COLOR[f.state]
      return {
        fills: out,
        legend: [
          { color: palette.success, label: t.muscle_ready },
          { color: palette.warning, label: t.muscle_recovering },
          { color: palette.danger, label: t.muscle_fatigued },
          { color: baseFill, label: t.muscle_legend_absent.replace('{n}', String(FATIGUE_WINDOW_DAYS)) },
        ],
      }
    }
    for (const [id, r] of Object.entries(retention)) {
      if (r.lastTrainedAt != null) out[Number(id)] = strengthColor(riskPctOf(r))
    }
    return {
      fills: out,
      legend: [
        { color: palette.success, label: t.muscle_kept },
        { color: palette.warning, label: t.muscle_declining },
        { color: palette.danger, label: t.muscle_high_risk },
        { color: baseFill, label: t.muscle_legend_absent.replace('{n}', String(RETENTION_WINDOW_DAYS)) },
      ],
    }
  }, [segment, balance, fatigue, retention, baseFill, t])

  const selectedGroup = selectedId !== null ? muscleGroups.find((g) => g.id === selectedId) ?? null : null

  function detailOf(group: MuscleGroup): string {
    if (segment === 'balance') {
      const entry = balance.entries.find((e) => e.muscleGroup.id === group.id)
      const value = entry?.effectiveSets ?? 0
      if (value === 0) return t.muscle_not_this_week
      const neglected = balance.neglected.some((g) => g.id === group.id)
      return t.muscle_week_sets.replace('{n}', formatSets(value, lang)) + (neglected ? t.muscle_neglected_suffix : '')
    }
    if (segment === 'recovery') {
      const f = fatigue[group.id]
      return f ? fatigueLabel[f.state] : t.muscle_not_in_days.replace('{n}', String(FATIGUE_WINDOW_DAYS))
    }
    const r = retention[group.id]
    if (!r || r.lastTrainedAt == null || r.daysSince == null) return t.muscle_not_in_days.replace('{n}', String(RETENTION_WINDOW_DAYS))
    const risk = riskPctOf(r)
    const when = daysSinceLabel(r.daysSince, t)
    // İngilizcede gün sözcüğü cümle sonuna gelir: "Trained yesterday".
    const trained = t.muscle_trained.replace('{when}', lang === 'en' ? when.toLowerCase() : when)
    return trained + (risk >= 5 ? t.muscle_risk_suffix.replace('{n}', String(risk)) : '')
  }

  // Hesaplar yalnızca tamamlanan setleri sayar; işaretlenmemiş setlerle boş figür
  // çizmek yerine nasıl dolacağı anlatılır. Canlı antrenmanda figür vurgu için açık kalır.
  const hasData = sets.some((s) => s.completed) || focusMuscleId !== null
  const emptyNote =
    segment === 'balance' && balance.totalSets === 0
      ? t.muscle_none_week
      : segment === 'recovery' && Object.keys(fatigue).length === 0
        ? t.muscle_none_days.replace('{n}', String(FATIGUE_WINDOW_DAYS))
        : null

  return (
    <GlassCard style={{ marginBottom: spacing[4] }}>
      <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing[3] }}>
        {t.muscle_title}
      </Text>

      {loading && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingVertical: spacing[2] }}>
          <ActivityIndicator size="small" color={colors.textMuted} />
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{t.muscle_loading}</Text>
        </View>
      )}

      {!loading && error && (
        <Text style={{ fontSize: fontSize.sm, color: palette.danger }}>{t.muscle_load_error}</Text>
      )}

      {!loading && !error && !hasData && (
        <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
          {t.muscle_empty}
        </Text>
      )}

      {!loading && !error && hasData && (
        <>
          <Segmented options={segments} value={segment} onChange={setSegment} />

          <MuscleBodyMap
            muscleGroups={anatomicalGroups}
            fills={fills}
            legend={legend}
            gender={gender}
            selectedId={selectedId}
            onSelect={setPickedId}
          />

          <View style={{ marginTop: spacing[3], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
            {selectedGroup ? (
              <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>
                <Text style={{ fontWeight: fontWeight.semibold }}>{nameOf(selectedGroup)}: </Text>
                {detailOf(selectedGroup)}
              </Text>
            ) : (
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
                {emptyNote ?? t.muscle_tap_hint}
              </Text>
            )}
            {segment === 'balance' && balance.neglected.length > 0 && !selectedGroup && (
              <Text style={{ fontSize: fontSize.xs, color: palette.warning, marginTop: spacing[1] }}>
                {t.muscle_neglected_list.replace('{names}', balance.neglected.map(nameOf).join(', '))}
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={() => setListOpen((open) => !open)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], paddingTop: spacing[3] }}
          >
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: palette.accent }}>
              {listOpen ? t.muscle_hide_list : t.muscle_all}
            </Text>
            <Ionicons name={listOpen ? 'chevron-up' : 'chevron-down'} size={16} color={palette.accent} />
          </TouchableOpacity>

          {listOpen && (
            <View style={{ marginTop: spacing[3] }}>
              {segment === 'balance' && [...balance.entries]
                .sort((a, b) => b.effectiveSets - a.effectiveSets || byName(a.muscleGroup, b.muscleGroup))
                .map((entry) => (
                  <View key={entry.muscleGroup.id} style={{ marginBottom: spacing[3] }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{nameOf(entry.muscleGroup)}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, fontVariant: ['tabular-nums'] }}>
                        {t.muscle_sets.replace('{n}', formatSets(entry.effectiveSets, lang))}
                      </Text>
                    </View>
                    <MuscleLevelBar fraction={entry.level / 4} color={levelColor(entry.level)} trackColor={colors.glassInner} />
                  </View>
                ))}

              {segment === 'recovery' && muscleGroups
                .filter((group) => fatigue[group.id])
                .sort(byName)
                .map((group) => {
                  const state = fatigue[group.id]!.state
                  return (
                    <View key={group.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{nameOf(group)}</Text>
                      <View style={{ paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, backgroundColor: `${FATIGUE_COLOR[state]}18` }}>
                        <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: FATIGUE_COLOR[state] }}>{fatigueLabel[state]}</Text>
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
                  return byName(a.group, b.group)
                })
                .map(({ group, r }) => (
                  <View key={group.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <Text style={{ fontSize: fontSize.sm, color: colors.textPrimary }}>{nameOf(group)}</Text>
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
