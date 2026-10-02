import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { EquipmentKey, ProgramEquipmentFit, WorkoutProgram } from '@lifeos/shared'
import { GlassCard } from '../ui/GlassCard'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'
import { EquipmentCard, ProgramFitBadge } from './EquipmentCard'

interface Props {
  /** Ekipmana uygunluğa göre sıralanmış programlar. */
  programs: WorkoutProgram[]
  fitByProgram: Map<string, ProgramEquipmentFit | null>
  equipment: EquipmentKey[] | null
  equipmentLoaded: boolean
  onEditEquipment: () => void
  onCreate: () => void
  onOpen: (program: WorkoutProgram) => void
}

interface ProgramCardProps {
  program: WorkoutProgram
  splitLabel: string
  fit: ProgramEquipmentFit | null
  onStart: () => void
}

/** Antrenman ekranının Programlar sekmesi: ekipman kartı, kendi programını oluştur ve program listesi. */
export function ProgramsTab({ programs, fitByProgram, equipment, equipmentLoaded, onEditEquipment, onCreate, onOpen }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()

  const SPLIT_LABELS: Record<string, string> = {
    bro_split: 'Bro Split', push_pull_legs: 'Push Pull Legs',
    full_body: 'Full Body', upper_lower: 'Upper Lower', custom: t.wk_split_custom,
  }

  return (
    <View style={{ gap: spacing[3] }}>
      <EquipmentCard equipment={equipment} loaded={equipmentLoaded} onEdit={onEditEquipment} />
      <TouchableOpacity
        onPress={onCreate}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingVertical: spacing[3], borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.accent }}
      >
        <Ionicons name="add" size={18} color={palette.accent} />
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>{t.wk_create_own}</Text>
      </TouchableOpacity>
      {programs.length === 0 ? (
        <View style={{ paddingTop: spacing[8], alignItems: 'center', gap: spacing[3] }}>
          <Ionicons name="list-outline" size={48} color={colors.textSubtle} />
          <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>{t.wk_programs_failed}</Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center' }}>{t.wk_programs_failed_hint}</Text>
        </View>
      ) : (
        programs.map((prog) => (
          <ProgramCard
            key={prog.id}
            program={prog}
            splitLabel={SPLIT_LABELS[prog.split_type] ?? prog.split_type}
            fit={fitByProgram.get(prog.id) ?? null}
            onStart={() => onOpen(prog)}
          />
        ))
      )}
    </View>
  )
}

function ProgramCard({ program, splitLabel, fit, onStart }: ProgramCardProps) {
  const { colors } = useTheme()
  const { t } = useLang()
  const isGlobal = program.user_id === null
  const dayCount = program.days?.filter((d) => !d.is_rest).length ?? program.frequency_per_week

  return (
    <GlassCard padding={spacing[4]} noShadow>
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
                {day.is_rest ? t.wk_rest_day : day.day_name}
              </Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        onPress={onStart}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: palette.workout }}
      >
        <Ionicons name="play-circle-outline" size={16} color="#fff" />
        {/* Artık doğrudan başlatmıyor: önce günleri ve hareketleri gösteriyor. */}
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: '#fff' }}>{t.wk_view_program}</Text>
      </TouchableOpacity>
    </GlassCard>
  )
}
