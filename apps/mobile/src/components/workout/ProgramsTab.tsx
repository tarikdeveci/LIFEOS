import { useState } from 'react'
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { EquipmentKey, ProgramEquipmentFit, WorkoutProgram } from '@lifeos/shared'
import { Button } from '../ui/Button'
import { GlassCard } from '../ui/GlassCard'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius, MIN_TOUCH } from '../../theme/tokens'
import { EquipmentCard, ProgramFitBadge } from './EquipmentCard'
import { programDayLabel } from './programDays'

interface Props {
  /** Ekipmana uygunluğa göre sıralanmış programlar. */
  programs: WorkoutProgram[]
  loading?: boolean
  error?: string | null
  /** Veri sahibi hatayi temizler ve basarisizlikta reject eder. */
  onRetry?: () => Promise<void>
  fitByProgram: Map<string, ProgramEquipmentFit | null>
  equipment: EquipmentKey[] | null
  equipmentLoaded: boolean
  onEditEquipment: () => void
  onCreate: () => void
  onOpen: (program: WorkoutProgram) => void
  /** Aktif program ve sıradaki gününün adı: kartı en üste alır ve işaretler. */
  active: { programId: string; nextDay: string } | null
}

interface ProgramCardProps {
  program: WorkoutProgram
  splitLabel: string
  fit: ProgramEquipmentFit | null
  onStart: () => void
  /** Aktif programda sıradaki günün adı. */
  nextDay: string | null
}

/** Antrenman ekranının Programlar sekmesi: ekipman kartı, kendi programını oluştur ve program listesi. */
export function ProgramsTab({ programs, fitByProgram, equipment, equipmentLoaded, onEditEquipment, onCreate, onOpen, active, loading = false, error = null, onRetry }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const [retryState, setRetryState] = useState({ retrying: false, failed: false })
  const hasError = error !== null || retryState.failed

  async function handleRetry() {
    if (!onRetry || retryState.retrying || loading) return
    setRetryState({ retrying: true, failed: false })
    try {
      await onRetry()
    } catch {
      setRetryState({ retrying: false, failed: true })
      return
    }
    setRetryState({ retrying: false, failed: false })
  }

  const SPLIT_LABELS: Record<string, string> = {
    bro_split: 'Bro Split', push_pull_legs: 'Push Pull Legs',
    full_body: 'Full Body', upper_lower: 'Upper Lower', custom: t.wk_split_custom,
  }
  const activeProgram = active ? programs.find((p) => p.id === active.programId) ?? null : null
  const others = activeProgram ? programs.filter((p) => p.id !== activeProgram.id) : programs

  return (
    <View style={{ gap: spacing[3] }}>
      {/* Aktif program listenin başında: kullanıcı kaldığı yerden devam eder. */}
      {activeProgram && (
        <ProgramCard
          program={activeProgram}
          splitLabel={SPLIT_LABELS[activeProgram.split_type] ?? activeProgram.split_type}
          fit={fitByProgram.get(activeProgram.id) ?? null}
          onStart={() => onOpen(activeProgram)}
          nextDay={active?.nextDay ?? null}
        />
      )}
      <EquipmentCard equipment={equipment} loaded={equipmentLoaded} onEdit={onEditEquipment} />
      {programs.length > 0 && (
        <Button label={t.wk_create_own} onPress={onCreate} variant="secondary" fullWidth style={{ minHeight: MIN_TOUCH }} />
      )}
      {hasError ? (
        <GlassCard padding={spacing[5]} noShadow>
          <View style={{ alignItems: 'center', gap: spacing[3] }}>
            <Text accessibilityRole="alert" style={{ fontSize: fontSize.base, color: colors.textPrimary, textAlign: 'center' }}>{t.wkf_programs_error}</Text>
            <Button label={t.wkf_retry} onPress={() => void handleRetry()} loading={retryState.retrying || loading} disabled={!onRetry} style={{ minHeight: MIN_TOUCH, alignSelf: 'center' }} />
          </View>
        </GlassCard>
      ) : loading || retryState.retrying ? (
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t.wkf_programs_loading} accessibilityState={{ busy: true }} style={{ padding: spacing[8], alignItems: 'center', gap: spacing[3] }}>
          <ActivityIndicator color={palette.workout} />
          <Text style={{ fontSize: fontSize.base, color: colors.textSecondary }}>{t.wkf_programs_loading}</Text>
        </View>
      ) : programs.length === 0 ? (
        <GlassCard padding={spacing[5]} noShadow>
          <View style={{ alignItems: 'center', gap: spacing[3] }}>
            <Ionicons name="list-outline" size={48} color={colors.textMuted} />
            <Text style={{ fontSize: fontSize.base, color: colors.textSecondary, textAlign: 'center' }}>{t.wkf_programs_empty}</Text>
            <Button label={t.wk_create_own} onPress={onCreate} style={{ minHeight: MIN_TOUCH, alignSelf: 'center' }} />
          </View>
        </GlassCard>
      ) : (
        others.map((prog) => (
          <ProgramCard
            key={prog.id}
            program={prog}
            splitLabel={SPLIT_LABELS[prog.split_type] ?? prog.split_type}
            fit={fitByProgram.get(prog.id) ?? null}
            onStart={() => onOpen(prog)}
            nextDay={null}
          />
        ))
      )}
    </View>
  )
}

function ProgramCard({ program, splitLabel, fit, onStart, nextDay }: ProgramCardProps) {
  const { colors } = useTheme()
  const { t } = useLang()
  const isGlobal = program.user_id === null
  const dayCount = program.days?.filter((d) => !d.is_rest).length ?? program.frequency_per_week

  return (
    <GlassCard padding={spacing[4]} noShadow>
      {nextDay !== null && (
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.workout, marginBottom: spacing[2] }}>
          {t.ux_wk_active_program} · {t.ux_wk_next_day.replace('{day}', nextDay)}
        </Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing[3] }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: 4 }}>
            <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{program.name}</Text>
            {isGlobal && (
              <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full, backgroundColor: `${palette.accent}15` }}>
                <Text style={{ fontSize: fontSize.xs, color: palette.accent, fontWeight: fontWeight.medium }}>{t.wk_template}</Text>
              </View>
            )}
          </View>
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }} numberOfLines={2}>{program.description}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginBottom: spacing[3] }}>
        <View style={{ paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, backgroundColor: `${palette.workout}12`, borderWidth: 1, borderColor: `${palette.workout}25` }}>
          <Text style={{ fontSize: fontSize.xs, color: palette.workout, fontWeight: fontWeight.medium }}>{splitLabel}</Text>
        </View>
        <View style={{ paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{t.wk_days_per_week.replace('{n}', String(dayCount))}</Text>
        </View>
        <ProgramFitBadge fit={fit} />
      </View>

      {/* Day names */}
      {program.days && program.days.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], marginBottom: spacing[3] }}>
          {program.days.slice(0, 6).map((day) => (
            <View key={day.id} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: day.is_rest ? colors.glassInner : `${palette.workout}10` }}>
              <Text style={{ fontSize: fontSize.xs, color: day.is_rest ? colors.textSubtle : palette.workout }}>
                {day.is_rest ? t.wk_rest_day : programDayLabel(day, t)}
              </Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        onPress={onStart}
        accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: MIN_TOUCH, borderRadius: radius.lg, backgroundColor: palette.workout }}
      >
        <Ionicons name="play-circle-outline" size={16} color="#fff" />
        {/* Artık doğrudan başlatmıyor: önce günleri ve hareketleri gösteriyor. */}
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: '#fff' }}>{t.wk_view_program}</Text>
      </TouchableOpacity>
    </GlassCard>
  )
}
