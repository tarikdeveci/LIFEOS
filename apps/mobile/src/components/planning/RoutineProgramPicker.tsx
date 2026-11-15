import { useEffect } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { useWorkoutStore } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius, MIN_TOUCH } from '@/src/theme/tokens'

interface Props {
  userId: string
  programId: string | null
  onChange: (programId: string | null) => void
}

/** Blok rutinini bir antrenman programına bağlar; program yoksa hiç görünmez. */
export function RoutineProgramPicker({ userId, programId, onChange }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const programs = useWorkoutStore((s) => s.programs)
  const fetchPrograms = useWorkoutStore((s) => s.fetchPrograms)

  useEffect(() => {
    if (programs.length === 0) void fetchPrograms(supabase, userId).catch(() => undefined)
    // Sadece açılışta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const options = programs.filter((p) => p.user_id !== null || p.id === programId)
  if (options.length === 0) return null

  const chip = (active: boolean) => ({
    minHeight: MIN_TOUCH, justifyContent: 'center' as const,
    paddingHorizontal: spacing[3], borderRadius: radius.md, borderWidth: 1,
    backgroundColor: active ? palette.accent : colors.glassInner,
    borderColor: active ? palette.accent : colors.border,
  })
  const chipText = (active: boolean) => ({
    fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: active ? '#fff' : colors.textMuted,
  })

  return (
    <View>
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textMuted, marginBottom: spacing[2] }}>
        {t.ux_routine_program}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: programId === null }} onPress={() => onChange(null)} style={chip(programId === null)}>
          <Text style={chipText(programId === null)}>{t.ux_routine_program_none}</Text>
        </TouchableOpacity>
        {options.map((p) => (
          <TouchableOpacity key={p.id} accessibilityRole="button" accessibilityState={{ selected: programId === p.id }} onPress={() => onChange(p.id)} style={chip(programId === p.id)}>
            <Text style={chipText(programId === p.id)} numberOfLines={1}>{p.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {programId !== null && (
        <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing[2] }}>{t.ux_routine_program_hint}</Text>
      )}
    </View>
  )
}
