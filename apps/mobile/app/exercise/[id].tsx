import { useEffect } from 'react'
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import Ionicons from '@expo/vector-icons/Ionicons'
import { equipmentLabel, missingEquipment, useWorkoutStore } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { ExerciseImage } from '@/src/components/workout/ExerciseImage'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

// Görseli olmayan hareketlerde (yüzme, yoga, dans) fotoğraf yerine kategori ikonu.
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  strength: 'barbell-outline',
  cardio: 'pulse-outline',
  flexibility: 'body-outline',
  mobility: 'sync-outline',
}

/**
 * Hareketin detayı. Görsel yalnızca burada gösterilir: kütüphane 148 görseli
 * aynı anda tam boyutta çözünce Android'in bitmap havuzu (150 MB) doluyor,
 * görsellerin bir kısmı düşüyor ve kaydırma ağırlaşıyordu.
 */
export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const { exercises, muscleGroups, equipment, libraryLoading, fetchLibrary } = useWorkoutStore()

  // Kütüphane açılmadan gelinirse (derin bağlantı) katalog burada yüklenir.
  useEffect(() => { void fetchLibrary(supabase) }, [fetchLibrary])

  const exercise = exercises.find((e) => e.id === id)
  const groupName = (g: { name: string; name_en: string } | null | undefined) => (g ? (lang === 'en' ? g.name_en : g.name) : '-')
  const categoryLabel = ({
    strength: t.wk_cat_strength, cardio: t.wk_cat_cardio, flexibility: t.wk_cat_flexibility, mobility: t.wk_cat_mobility,
  } as Record<string, string>)
  const sectionTitle = { fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textSubtle, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing[2] } as const
  const bodyText = { fontSize: fontSize.base, color: colors.textPrimary } as const

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[5], paddingVertical: spacing[4], borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="chevron-back" size={20} color={palette.accent} />
        <Text style={{ fontSize: fontSize.base, color: palette.accent, fontWeight: fontWeight.medium }}>{t.back}</Text>
      </TouchableOpacity>
    </View>
  )

  if (!exercise) {
    return (
      <ScreenBackground edges={['top']}>
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {libraryLoading
            ? <ActivityIndicator color={palette.accent} />
            : <Text style={{ color: colors.textSubtle }}>{t.wk_detail_not_found}</Text>}
        </View>
      </ScreenBackground>
    )
  }

  const secondary = muscleGroups.filter((g) => exercise.secondary_muscle_group_ids.includes(g.id))
  const missing = missingEquipment(exercise, equipment)
  // Talimatlar veritabanında yalnızca Türkçe.
  const instructions = lang === 'tr' ? exercise.instructions : null

  return (
    <ScreenBackground edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={{ padding: spacing[5], paddingBottom: 60, gap: spacing[4] }} showsVerticalScrollIndicator={false}>
        <ExerciseImage
          uri={exercise.image_url}
          style={{ width: '100%', aspectRatio: 3 / 2, borderRadius: radius.lg }}
          fallback={(
            <View style={{ height: 120, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: `${palette.accent}10`, borderWidth: 1, borderColor: `${palette.accent}20` }}>
              <Ionicons name={CATEGORY_ICONS[exercise.category] ?? 'fitness-outline'} size={48} color={palette.accent} />
            </View>
          )}
        />

        <View>
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>
            {lang === 'en' ? (exercise.name_en ?? exercise.name) : exercise.name}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 }}>
            {groupName(exercise.muscle_group)} · {categoryLabel[exercise.category] ?? exercise.category}
            {exercise.is_bodyweight ? ` · ${t.wk_bodyweight}` : ''}
          </Text>
        </View>

        {secondary.length > 0 && (
          <GlassCard>
            <Text style={sectionTitle}>{t.wk_detail_secondary}</Text>
            <Text style={bodyText}>{secondary.map(groupName).join(', ')}</Text>
          </GlassCard>
        )}

        {exercise.equipment != null && (
          <GlassCard>
            <Text style={sectionTitle}>{t.wk_detail_equipment}</Text>
            <Text style={bodyText}>
              {exercise.equipment.length === 0
                ? t.wk_detail_no_equipment
                : exercise.equipment.map((key) => equipmentLabel(key, lang)).join(', ')}
            </Text>
            {missing.length > 0 && (
              <Text style={{ fontSize: fontSize.sm, color: palette.warning, marginTop: spacing[2] }}>
                {t.wk_missing_equipment.replace('{list}', missing.map((key) => equipmentLabel(key, lang)).join(', '))}
              </Text>
            )}
          </GlassCard>
        )}

        {instructions && (
          <GlassCard>
            <Text style={sectionTitle}>{t.wk_detail_how}</Text>
            <Text style={bodyText}>{instructions}</Text>
          </GlassCard>
        )}
      </ScrollView>
    </ScreenBackground>
  )
}
