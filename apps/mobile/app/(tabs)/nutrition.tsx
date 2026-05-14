import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/src/lib/supabase'
import { callAiSuggest, callParseMeal } from '@/src/lib/ai'
import type { ParsedItem } from '@/src/lib/ai'
import { useNutritionStore } from '@lifeos/shared'
import type { MealType } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { ProgressBar } from '@/src/components/ui/ProgressBar'
import { StatCard } from '@/src/components/ui/StatCard'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'Kahvaltı' },
  { key: 'lunch',     label: 'Öğle' },
  { key: 'dinner',    label: 'Akşam' },
  { key: 'snack',     label: 'Ara Öğün' },
]

interface ChatMsg { role: 'user' | 'assistant'; content: string }

export default function NutritionScreen() {
  const { colors } = useTheme()
  const { meals, target, dailySummary, fetchDayNutrition, addMeal, removeMeal } = useNutritionStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Add modal
  const [showAdd, setShowAdd] = useState(false)
  const [rawInput, setRawInput] = useState('')
  const [mealType, setMealType] = useState<MealType>('lunch')
  const [parsing, setParsing] = useState(false)
  const [parsedItems, setParsedItems] = useState<ParsedItem[] | null>(null)
  const [adding, setAdding] = useState(false)

  // Food search
  const [foodSearch, setFoodSearch] = useState('')
  const [foodResults, setFoodResults] = useState<Array<{ id: string; name: string; calories_per_100g: number; protein_per_100g: number }>>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // AI Chat
  const [showChat, setShowChat] = useState(false)
  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const todayStr = new Date().toISOString().split('T')[0]

  const load = useCallback(async (uid: string) => {
    await fetchDayNutrition(supabase, uid, todayStr)
  }, [todayStr, fetchDayNutrition])

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

  function handleFoodSearch(q: string) {
    setFoodSearch(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!q.trim()) { setFoodResults([]); return }
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('food_items')
        .select('id, name, calories_per_100g, protein_per_100g')
        .ilike('name', `%${q}%`)
        .limit(6)
      setFoodResults((data ?? []) as typeof foodResults)
    }, 300)
  }

  async function handleParse() {
    if (!rawInput.trim()) return
    setParsing(true)
    setParsedItems(null)
    try {
      const result = await callParseMeal({ raw_input: rawInput, user_id: userId })
      setParsedItems(result.items)
    } catch {
      Alert.alert('Hata', 'Öğün analiz edilemedi')
    } finally {
      setParsing(false)
    }
  }

  async function handleAddMeal() {
    if (!userId) return
    setAdding(true)
    try {
      const items = parsedItems ?? []
      const totals = items.reduce(
        (s, i) => ({ cal: s.cal + i.calories, prot: s.prot + i.protein, carbs: s.carbs + i.carbs, fat: s.fat + i.fat, fiber: s.fiber + i.fiber }),
        { cal: 0, prot: 0, carbs: 0, fat: 0, fiber: 0 },
      )
      await addMeal(supabase, userId, {
        date: todayStr, meal_type: mealType, raw_input: rawInput.trim(),
        items: items as never[],
        total_calories: totals.cal, total_protein: totals.prot,
        total_carbs: totals.carbs, total_fat: totals.fat, total_fiber: totals.fiber,
      })
      setRawInput(''); setParsedItems(null); setShowAdd(false)
    } catch { Alert.alert('Hata', 'Öğün eklenemedi') }
    finally { setAdding(false) }
  }

  async function handleChat() {
    if (!chatInput.trim() || !userId) return
    const userMsg: ChatMsg = { role: 'user', content: chatInput.trim() }
    setChatMsgs((m) => [...m, userMsg])
    setChatInput('')
    setChatLoading(true)
    try {
      const todayMeals = meals.filter((m) => m.date === todayStr)
      const data = await callAiSuggest<{ message?: string }>({
        type: 'nutrition_chat',
        target,
        consumed: {
          cal:   dailySummary?.calories ?? 0,
          prot:  dailySummary?.protein  ?? 0,
          carbs: dailySummary?.carbs    ?? 0,
          fat:   dailySummary?.fat      ?? 0,
        },
        meals_today: todayMeals.map((m) => ({ meal_type: m.meal_type, items: m.items })),
        history: chatMsgs.slice(-8).map((m) => ({ role: m.role, content: m.content })),
        user_message: userMsg.content,
      })
      setChatMsgs((m) => [...m, { role: 'assistant', content: data.message ?? 'Yanıt alınamadı' }])
    } catch {
      setChatMsgs((m) => [...m, { role: 'assistant', content: 'Hata oluştu, tekrar dene.' }])
    } finally { setChatLoading(false) }
  }

  const todayMeals = meals.filter((m) => m.date === todayStr)
  const totalCal   = dailySummary?.calories ?? todayMeals.reduce((s, m) => s + (m.total_calories ?? 0), 0)
  const totalProt  = dailySummary?.protein  ?? todayMeals.reduce((s, m) => s + (m.total_protein ?? 0), 0)
  const totalCarbs = dailySummary?.carbs    ?? todayMeals.reduce((s, m) => s + (m.total_carbs ?? 0), 0)
  const totalFat   = dailySummary?.fat      ?? todayMeals.reduce((s, m) => s + (m.total_fat ?? 0), 0)
  const totalFiber = dailySummary?.fiber    ?? todayMeals.reduce((s, m) => s + (m.total_fiber ?? 0), 0)

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
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <TouchableOpacity onPress={() => setShowChat(true)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.accent}18`, borderWidth: 1, borderColor: `${palette.accent}30`, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="sparkles-outline" size={18} color={palette.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAdd(true)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.meal, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Summary */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing[4] }}>Bugün</Text>

          {/* 4 macro stat chips */}
          <View style={{ flexDirection: 'row', gap: spacing[2], marginBottom: spacing[4] }}>
            <StatCard label="Kalori" value={totalCal} color={palette.warning} />
            <StatCard label="Protein" value={`${Math.round(totalProt)}g`} color={palette.info} />
            <StatCard label="Karb" value={`${Math.round(totalCarbs)}g`} color={palette.success} />
            <StatCard label="Yağ" value={`${Math.round(totalFat)}g`} color={palette.danger} />
          </View>

          {/* Progress bars against targets */}
          {target ? (
            <View style={{ gap: spacing[3] }}>
              {(target.calories ?? 0) > 0 && (
                <ProgressBar label="Kalori" value={totalCal} target={target.calories} unit=" kcal" color={palette.warning} />
              )}
              {(target.protein_g ?? 0) > 0 && (
                <ProgressBar label="Protein" value={totalProt} target={target.protein_g} color={palette.info} />
              )}
              {(target.carbs_g ?? 0) > 0 && (
                <ProgressBar label="Karbonhidrat" value={totalCarbs} target={target.carbs_g} color={palette.success} />
              )}
              {(target.fat_g ?? 0) > 0 && (
                <ProgressBar label="Yağ" value={totalFat} target={target.fat_g} color={palette.danger} />
              )}
              {(target.fiber_g ?? 0) > 0 && (
                <ProgressBar label="Lif" value={totalFiber} target={target.fiber_g} color="#10B981" />
              )}
            </View>
          ) : (
            <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center' }}>
              Hedef belirlemek için Profil → Beslenme Hedefleri →
            </Text>
          )}
        </GlassCard>

        {/* Food quick search */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>Hızlı Yiyecek Ara</Text>
          <Input value={foodSearch} onChangeText={handleFoodSearch} placeholder="Yumurta, ekmek, peynir..." />
          {foodResults.length > 0 && (
            <View style={{ marginTop: spacing[3], gap: 2 }}>
              {foodResults.map((food) => (
                <TouchableOpacity
                  key={food.id}
                  onPress={() => { setRawInput(food.name); setFoodSearch(''); setFoodResults([]); setShowAdd(true) }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.base, color: colors.textSecondary }}>{food.name}</Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{food.calories_per_100g} kcal · {food.protein_per_100g}g protein (100g)</Text>
                  </View>
                  <Ionicons name="add-circle-outline" size={22} color={palette.meal} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </GlassCard>

        {/* Meals by type */}
        {MEAL_TYPES.map(({ key, label }) => {
          const typeMeals = todayMeals.filter((m) => m.meal_type === key)
          if (typeMeals.length === 0) return null
          return (
            <View key={key} style={{ marginBottom: spacing[4] }}>
              <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textMuted, marginBottom: spacing[2] }}>{label}</Text>
              {typeMeals.map((meal) => (
                <GlassCard key={meal.id} padding={spacing[4]} style={{ marginBottom: spacing[2] }} noShadow>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: fontSize.base, color: colors.textSecondary, marginBottom: 4 }} numberOfLines={2}>{meal.raw_input}</Text>
                      <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
                        {meal.total_calories} kcal · P:{meal.total_protein}g · K:{meal.total_carbs}g · Y:{meal.total_fat}g
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeMeal(supabase, meal.id)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
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
            <Button label="Öğün ekle" onPress={() => setShowAdd(true)} variant="secondary" />
          </View>
        )}
      </ScrollView>

      {/* Add meal */}
      <BottomSheet visible={showAdd} onClose={() => { setShowAdd(false); setParsedItems(null) }} title="Öğün Ekle" scrollable>
        <View style={{ gap: spacing[4] }}>
          <View>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textMuted, marginBottom: spacing[2] }}>Öğün türü</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
              {MEAL_TYPES.map(({ key, label }) => (
                <TouchableOpacity key={key} onPress={() => setMealType(key)} style={{ paddingHorizontal: spacing[3], paddingVertical: 8, borderRadius: 10, backgroundColor: mealType === key ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: mealType === key ? palette.accent : colors.border }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: mealType === key ? '#fff' : colors.textMuted }}>{label}</Text>
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

          {!parsedItems && (
            <Button label={parsing ? 'AI analiz ediyor...' : '✦ AI ile Hesapla'} onPress={handleParse} loading={parsing} variant="secondary" fullWidth />
          )}

          {parsedItems && (
            <View style={{ gap: spacing[2] }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{parsedItems.length} besin bulundu</Text>
              {parsedItems.map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, flex: 1 }}>{item.name} ({item.amount}{item.unit})</Text>
                  <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{item.calories} kcal</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing[2] }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary }}>Toplam</Text>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: palette.warning }}>
                  {parsedItems.reduce((s, i) => s + i.calories, 0)} kcal
                </Text>
              </View>
            </View>
          )}

          <Button label={adding ? 'Ekleniyor...' : 'Kaydet'} onPress={handleAddMeal} loading={adding} fullWidth />
        </View>
      </BottomSheet>

      {/* AI Chat */}
      <BottomSheet visible={showChat} onClose={() => setShowChat(false)} title="Beslenme Asistanı" scrollable>
        <View style={{ gap: spacing[3] }}>
          {chatMsgs.length === 0 && (
            <View style={{ padding: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.accent}10`, borderWidth: 1, borderColor: `${palette.accent}20` }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>
                Bugünkü beslenmen hakkında soru sorabilirsin. Örn: "Kaç kalori kaldı?", "Protein ihtiyacımı karşıladım mı?"
              </Text>
            </View>
          )}
          {chatMsgs.map((msg, i) => (
            <View key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: spacing[3], borderRadius: radius.lg, backgroundColor: msg.role === 'user' ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: msg.role === 'user' ? palette.accent : colors.border }}>
              <Text style={{ fontSize: fontSize.sm, color: msg.role === 'user' ? '#fff' : colors.textSecondary, lineHeight: 20 }}>{msg.content}</Text>
            </View>
          ))}
          {chatLoading && (
            <View style={{ alignSelf: 'flex-start', padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner }}>
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>Yazıyor...</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] }}>
            <Input value={chatInput} onChangeText={setChatInput} placeholder="Sorun..." containerStyle={{ flex: 1 }} onSubmitEditing={handleChat} returnKeyType="send" />
            <TouchableOpacity onPress={handleChat} disabled={chatLoading || !chatInput.trim()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: chatInput.trim() ? palette.accent : colors.glassInner, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
              <Ionicons name="arrow-up" size={20} color={chatInput.trim() ? '#fff' : colors.textSubtle} />
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>
    </ScreenBackground>
  )
}
