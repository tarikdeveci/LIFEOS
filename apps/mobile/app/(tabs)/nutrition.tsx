import { useEffect, useState, useCallback } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/src/lib/supabase'
import { useNutritionStore, MEAL_TYPE_LABELS } from '@lifeos/shared'
import type { MealType } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { ProgressBar } from '@/src/components/ui/ProgressBar'
import { StatCard } from '@/src/components/ui/StatCard'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export default function NutritionScreen() {
  const { colors } = useTheme()
  const { meals, nutritionTargets, fetchMeals, fetchNutritionTargets, addMeal, deleteMeal } = useNutritionStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [rawInput, setRawInput] = useState('')
  const [mealType, setMealType] = useState<MealType>('lunch')
  const [adding, setAdding] = useState(false)

  const todayStr = new Date().toISOString().split('T')[0]

  const load = useCallback(async (uid: string) => {
    await Promise.all([fetchMeals(uid, todayStr), fetchNutritionTargets(uid)])
  }, [todayStr, fetchMeals, fetchNutritionTargets])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUserId(data.user.id); void load(data.user.id) }
    })
  }, [load])

  async function handleRefresh() {
    if (!userId) return
    setRefreshing(true)
    await load(userId)
    setRefreshing(false)
  }

  async function handleAdd() {
    if (!userId || !rawInput.trim()) return
    setAdding(true)
    try {
      await addMeal(userId, {
        date: todayStr,
        meal_type: mealType,
        raw_input: rawInput.trim(),
        items: [],
        total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0, total_fiber: 0,
      })
      setRawInput('')
      setShowAdd(false)
    } catch {
      Alert.alert('Hata', 'Öğün eklenemedi')
    } finally {
      setAdding(false)
    }
  }

  const todayMeals = meals.filter((m) => m.date === todayStr)
  const target = nutritionTargets?.[0]
  const totals = todayMeals.reduce(
    (s, m) => ({
      cal: s.cal + (m.total_calories ?? 0),
      prot: s.prot + (m.total_protein ?? 0),
      carbs: s.carbs + (m.total_carbs ?? 0),
      fat: s.fat + (m.total_fat ?? 0),
    }),
    { cal: 0, prot: 0, carbs: 0, fat: 0 },
  )

  return (
    <ScreenBackground>
      <ScrollView
        contentContainerStyle={{ padding: spacing[5], paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[5] }}>
          <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>Beslenme</Text>
          <TouchableOpacity
            onPress={() => setShowAdd(true)}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Summary */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing[4] }}>
            Bugün
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing[2], marginBottom: target ? spacing[4] : 0 }}>
            <StatCard label="Kalori" value={totals.cal} color={palette.warning} />
            <StatCard label="Protein" value={`${totals.prot}g`} color={palette.info} />
            <StatCard label="Karb" value={`${totals.carbs}g`} color={palette.success} />
            <StatCard label="Yağ" value={`${totals.fat}g`} color={palette.danger} />
          </View>
          {target && (
            <View style={{ gap: spacing[3] }}>
              <ProgressBar label="Kalori" value={totals.cal} target={target.calories} unit=" kcal" color={palette.warning} />
              <ProgressBar label="Protein" value={totals.prot} target={target.protein_g} color={palette.info} />
              <ProgressBar label="Karbonhidrat" value={totals.carbs} target={target.carbs_g} color={palette.success} />
              <ProgressBar label="Yağ" value={totals.fat} target={target.fat_g} color={palette.danger} />
            </View>
          )}
        </GlassCard>

        {/* Meals by type */}
        {MEAL_TYPES.map((type) => {
          const typeMeals = todayMeals.filter((m) => m.meal_type === type)
          if (typeMeals.length === 0) return null
          return (
            <View key={type} style={{ marginBottom: spacing[4] }}>
              <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textMuted, marginBottom: spacing[2] }}>
                {MEAL_TYPE_LABELS[type]}
              </Text>
              {typeMeals.map((meal) => (
                <GlassCard key={meal.id} padding={spacing[4]} style={{ marginBottom: spacing[2] }} noShadow>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.base, color: colors.textSecondary, marginBottom: 4 }} numberOfLines={2}>
                        {meal.raw_input}
                      </Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
                        {meal.total_calories} kcal · {meal.total_protein}g protein
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => deleteMeal(meal.id)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.textSubtle} />
                    </TouchableOpacity>
                  </View>
                </GlassCard>
              ))}
            </View>
          )
        })}

        {todayMeals.length === 0 && (
          <View style={{ paddingTop: spacing[8], alignItems: 'center', gap: spacing[3] }}>
            <Ionicons name="restaurant-outline" size={48} color={colors.textSubtle} />
            <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>Bugün öğün eklenmemiş</Text>
            <Button label="İlk öğünü ekle" onPress={() => setShowAdd(true)} variant="secondary" />
          </View>
        )}
      </ScrollView>

      {/* Add modal */}
      <BottomSheet visible={showAdd} onClose={() => setShowAdd(false)} title="Öğün Ekle" scrollable>
        <View style={{ gap: spacing[4] }}>
          {/* Meal type selector */}
          <View>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textMuted, marginBottom: spacing[2] }}>
              Öğün türü
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
              {MEAL_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setMealType(t)}
                  style={{
                    paddingHorizontal: spacing[3], paddingVertical: 8, borderRadius: 10,
                    backgroundColor: mealType === t ? palette.accent : colors.glassInner,
                    borderWidth: 1, borderColor: mealType === t ? palette.accent : colors.border,
                  }}
                >
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: mealType === t ? '#fff' : colors.textMuted }}>
                    {MEAL_TYPE_LABELS[t]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Input
            label="Ne yedin?"
            value={rawInput}
            onChangeText={setRawInput}
            placeholder="2 yumurta, tam buğday ekmek, beyaz peynir..."
            multiline
            numberOfLines={3}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
            autoFocus
          />

          <Button label={adding ? 'Ekleniyor...' : 'Ekle'} onPress={handleAdd} loading={adding} fullWidth />
        </View>
      </BottomSheet>
    </ScreenBackground>
  )
}
