import { View, Text, ScrollView, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import type { EquipmentKey, Exercise, MuscleGroup } from '@lifeos/shared'
import { GlassCard } from '../ui/GlassCard'
import { Input } from '../ui/Input'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'
import { categoryLabel, exerciseName, missingLabel, muscleGroupName } from './labels'

interface Props {
  /** Arama ve süzgeçlerden geçen hareketler. */
  exercises: Exercise[]
  /** Katalogdaki toplam hareket sayısı ("Tümü" çipi için). */
  totalCount: number
  muscleGroups: MuscleGroup[]
  equipment: EquipmentKey[] | null
  search: string
  onChangeSearch: (value: string) => void
  filterGroupId: number | null
  onChangeFilterGroup: (id: number | null) => void
  onlyAvailable: boolean
  onToggleOnlyAvailable: () => void
  /** Süren antrenman varken satırlarda "+ Set" çıkar. */
  canAddSet: boolean
  onAddSet: (exercise: Exercise) => void
}

/** Antrenman ekranının Kütüphane sekmesi: arama, kas grubu ve ekipman süzgeci, hareket listesi. */
export function LibraryTab({
  exercises, totalCount, muscleGroups, equipment, search, onChangeSearch, filterGroupId, onChangeFilterGroup,
  onlyAvailable, onToggleOnlyAvailable, canAddSet, onAddSet,
}: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()

  return (
    <>
      <Input value={search} onChangeText={onChangeSearch} onClear={() => onChangeSearch('')} clearLabel={t.wk_search_clear} placeholder={t.wk_library_search} containerStyle={{ marginBottom: spacing[3] }} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing[4] }}>
        <View style={{ flexDirection: 'row', gap: spacing[2] }}>
          {equipment !== null && (
            <TouchableOpacity onPress={onToggleOnlyAvailable} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: onlyAvailable ? palette.success : colors.glassInner, borderWidth: 1, borderColor: onlyAvailable ? palette.success : colors.border }}>
              <Ionicons name="construct-outline" size={12} color={onlyAvailable ? '#fff' : colors.textMuted} />
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: onlyAvailable ? '#fff' : colors.textMuted }}>{t.wk_fits_mine}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => onChangeFilterGroup(null)} style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: !filterGroupId ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: !filterGroupId ? palette.accent : colors.border }}>
            <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: !filterGroupId ? '#fff' : colors.textMuted }}>{t.wk_all_n.replace('{n}', String(totalCount))}</Text>
          </TouchableOpacity>
          {muscleGroups.map((mg) => (
            <TouchableOpacity key={mg.id} onPress={() => onChangeFilterGroup(filterGroupId === mg.id ? null : mg.id)} style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: filterGroupId === mg.id ? palette.workout : colors.glassInner, borderWidth: 1, borderColor: filterGroupId === mg.id ? palette.workout : colors.border }}>
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: filterGroupId === mg.id ? '#fff' : colors.textMuted }}>{muscleGroupName(mg, lang)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, marginBottom: spacing[3] }}>
        {exercises.length === 1 ? t.wk_one_exercise : t.wk_n_exercises.replace('{n}', String(exercises.length))}{canAddSet ? t.wk_add_set_hint : ''}
      </Text>

      <View style={{ gap: spacing[2] }}>
        {exercises.map((ex) => (
          <GlassCard key={ex.id} padding={spacing[4]} noShadow>
            {/* Satır tek erişilebilirlik öğesi; iç "+ Set" ekran okuyucuya özel eylem olarak da sunulur. */}
            <TouchableOpacity
              onPress={() => router.push(`/exercise/${ex.id}` as never)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityActions={canAddSet ? [{ name: 'addSet', label: t.wk_add_set }] : undefined}
              onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'addSet') onAddSet(ex) }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{exerciseName(ex, lang, t)}</Text>
                <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
                  {muscleGroupName(ex.muscle_group, lang)} · {categoryLabel(ex.category, t)}
                  {ex.is_bodyweight ? ` · ${t.wk_bodyweight}` : ''}
                </Text>
                {missingLabel(ex, equipment, lang, t) && (
                  <Text style={{ fontSize: fontSize.xs, color: palette.warning, marginTop: 2 }}>{missingLabel(ex, equipment, lang, t)}</Text>
                )}
              </View>
              {canAddSet && (
                <TouchableOpacity
                  onPress={() => onAddSet(ex)}
                  accessibilityRole="button"
                  accessibilityLabel={t.wk_add_set}
                  hitSlop={8}
                  style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: `${palette.workout}18`, borderWidth: 1, borderColor: `${palette.workout}30` }}
                >
                  <Text style={{ fontSize: fontSize.xs, color: palette.workout, fontWeight: fontWeight.semibold }}>+ Set</Text>
                </TouchableOpacity>
              )}
              <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
            </TouchableOpacity>
          </GlassCard>
        ))}
        {exercises.length === 0 && (
          <View style={{ paddingTop: spacing[8], alignItems: 'center' }}>
            <Text style={{ color: colors.textSubtle }}>{t.work_no_results}</Text>
          </View>
        )}
      </View>
    </>
  )
}
