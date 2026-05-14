import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/src/lib/supabase'
import { callAiSuggest, callParseMeal } from '@/src/lib/ai'
import type { ParsedItem } from '@/src/lib/ai'
import { useNutritionStore } from '@lifeos/shared'
import type { MealType, Meal, MealItem } from '@lifeos/shared'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { ProgressBar } from '@/src/components/ui/ProgressBar'
import { StatCard } from '@/src/components/ui/StatCard'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

interface ChatMsg { role: 'user' | 'assistant'; content: string }

export default function NutritionScreen() {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const { meals, target, dailySummary, fetchDayNutrition, addMeal, editMeal, removeMeal } = useNutritionStore()

  const MEAL_TYPES: { key: MealType; label: string }[] = [
    { key: 'breakfast', label: t.nutr_breakfast },
    { key: 'lunch',     label: t.nutr_lunch },
    { key: 'dinner',    label: t.nutr_dinner },
    { key: 'snack',     label: t.nutr_snack },
  ]
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
  const [foodResults, setFoodResults] = useState<Array<{ id: string; name: string; name_en: string | null; calories: number; protein: number; serving_size: number; serving_unit: string }>>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Edit modal
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null)
  const [editRawInput, setEditRawInput] = useState('')
  const [editItems, setEditItems] = useState<MealItem[]>([])
  const [editLoading, setEditLoading] = useState(false)

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
      const term = q.trim()
      const { data } = await supabase
        .from('food_items')
        .select('id, name, name_en, calories, protein, serving_size, serving_unit')
        .or(`name.ilike.%${term}%,name_en.ilike.%${term}%`)
        .limit(6)
      setFoodResults((data ?? []) as unknown as typeof foodResults)
    }, 300)
  }

  function openEditMeal(meal: Meal) {
    setEditingMeal(meal)
    setEditRawInput(meal.raw_input ?? '')
    setEditItems(meal.items ?? [])
  }

  function updateEditItemAmount(index: number, amountRaw: string) {
    const nextAmount = Number(amountRaw)
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) return

    setEditItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item
      const baseAmount = item.amount > 0 ? item.amount : 1
      const ratio = nextAmount / baseAmount
      return {
        ...item,
        amount: nextAmount,
        calories: Math.round(item.calories * ratio),
        protein: Math.round(item.protein * ratio * 10) / 10,
        carbs: Math.round(item.carbs * ratio * 10) / 10,
        fat: Math.round(item.fat * ratio * 10) / 10,
        fiber: Math.round(item.fiber * ratio * 10) / 10,
      }
    }))
  }

  async function handleSaveMealEdit() {
    if (!editingMeal) return
    setEditLoading(true)
    try {
      await editMeal(supabase, editingMeal.id, {
        raw_input: editRawInput.trim(),
        items: editItems,
      })
      setEditingMeal(null)
      setEditItems([])
      setEditRawInput('')
      if (userId) await load(userId)
    } catch {
      Alert.alert('Hata', 'Öğün güncellenemedi')
    } finally {
      setEditLoading(false)
    }
  }

  async function handleReparseEditMeal() {
    if (!editingMeal || !userId || !editRawInput.trim()) return
    setEditLoading(true)
    try {
      const result = await callParseMeal({ raw_input: editRawInput.trim(), user_id: userId })
      setEditItems(result.items as MealItem[])
    } catch {
      Alert.alert('Hata', 'Öğün yeniden analiz edilemedi')
    } finally {
      setEditLoading(false)
    }
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
      await addMeal(supabase, userId, {
        date: todayStr, meal_type: mealType, raw_input: rawInput.trim(),
        items: items as never[],
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
          <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.nutr_title}</Text>
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
          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing[4] }}>{t.today}</Text>

          {/* 2x2 macro grid */}
          <View style={{ gap: spacing[2], marginBottom: spacing[4] }}>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <StatCard label={t.nutr_calories} value={`${totalCal}`} color={palette.warning} />
              <StatCard label={t.nutr_protein} value={`${Math.round(totalProt)}g`} color={palette.info} />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              <StatCard label={t.nutr_carbs} value={`${Math.round(totalCarbs)}g`} color={palette.success} />
              <StatCard label={t.nutr_fat} value={`${Math.round(totalFat)}g`} color={palette.danger} />
            </View>
          </View>

          {/* Progress bars against targets */}
          {target ? (
            <View style={{ gap: spacing[3] }}>
              {(target.calories ?? 0) > 0 && (
                <ProgressBar label={t.nutr_calories} value={totalCal} target={target.calories} unit=" kcal" color={palette.warning} />
              )}
              {(target.protein ?? 0) > 0 && (
                <ProgressBar label={t.nutr_protein} value={totalProt} target={target.protein} color={palette.info} />
              )}
              {(target.carbs ?? 0) > 0 && (
                <ProgressBar label={t.nutr_carbs} value={totalCarbs} target={target.carbs} color={palette.success} />
              )}
              {(target.fat ?? 0) > 0 && (
                <ProgressBar label={t.nutr_fat} value={totalFat} target={target.fat} color={palette.danger} />
              )}
              {(target.fiber ?? 0) > 0 && (
                <ProgressBar label={t.nutr_fiber} value={totalFiber} target={target.fiber} color="#10B981" />
              )}
            </View>
          ) : (
            <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle, textAlign: 'center' }}>
              {t.today_set_goals}
            </Text>
          )}
        </GlassCard>

        {/* Food quick search */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>{t.nutr_quick_search ?? 'Hızlı Yiyecek Ara'}</Text>
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
                    <Text style={{ fontSize: fontSize.base, color: colors.textSecondary }}>
                      {lang === 'en' && food.name_en ? food.name_en : food.name}
                    </Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, marginBottom: 1 }}>
                      {lang === 'en' ? food.name : (food.name_en ?? '')}
                    </Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{Math.round(food.calories)} kcal · {Math.round(food.protein)}g protein ({food.serving_size}{food.serving_unit})</Text>
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
                    <TouchableOpacity onPress={() => openEditMeal(meal)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ marginLeft: spacing[2] }}>
                      <Ionicons name="create-outline" size={16} color={colors.textSubtle} />
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
            <Text style={{ fontSize: fontSize.base, color: colors.textSubtle }}>{t.nutr_no_meals}</Text>
            <Button label={t.nutr_add_meal} onPress={() => setShowAdd(true)} variant="secondary" />
          </View>
        )}
      </ScrollView>

      {/* Add meal */}
      <BottomSheet visible={showAdd} onClose={() => { setShowAdd(false); setParsedItems(null) }} title={t.nutr_add_meal} scrollable>
        <View style={{ gap: spacing[4] }}>
          <View>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textMuted, marginBottom: spacing[2] }}>{t.nutr_meal_type}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
              {MEAL_TYPES.map(({ key, label }) => (
                <TouchableOpacity key={key} onPress={() => setMealType(key)} style={{ paddingHorizontal: spacing[3], paddingVertical: 8, borderRadius: 10, backgroundColor: mealType === key ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: mealType === key ? palette.accent : colors.border }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: mealType === key ? '#fff' : colors.textMuted }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Input
            label={t.nutr_what_did_you_eat}
            value={rawInput}
            onChangeText={setRawInput}
            placeholder="2 yumurta, tam buğday ekmek, beyaz peynir..."
            multiline
            numberOfLines={3}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
            autoFocus
          />

          {!parsedItems && (
            <Button label={parsing ? t.nutr_analyzing : t.nutr_ai_analyze} onPress={handleParse} loading={parsing} variant="secondary" fullWidth />
          )}

          {parsedItems && (
            <View style={{ gap: spacing[2] }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{parsedItems.length} {t.nutr_nutrients_found}</Text>
              {parsedItems.map((item, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, flex: 1 }}>{item.name} ({item.amount}{item.unit})</Text>
                  <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{item.calories} kcal</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing[2] }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.nutr_total}</Text>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: palette.warning }}>
                  {parsedItems.reduce((s, i) => s + i.calories, 0)} kcal
                </Text>
              </View>
            </View>
          )}

          <Button label={adding ? t.nutr_saving : t.nutr_save} onPress={handleAddMeal} loading={adding} fullWidth />
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

      {/* Edit meal */}
      <BottomSheet
        visible={!!editingMeal}
        onClose={() => { setEditingMeal(null); setEditItems([]); setEditRawInput('') }}
        title="Öğün Düzenle"
        scrollable
      >
        <View style={{ gap: spacing[4] }}>
          <Input
            label="Öğün Metni"
            value={editRawInput}
            onChangeText={setEditRawInput}
            placeholder="2 yumurta, 100g tavuk..."
            multiline
            numberOfLines={3}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />

          <Button
            label={editLoading ? 'AI yeniden hesaplıyor...' : '✦ AI ile Yeniden Hesapla'}
            onPress={() => void handleReparseEditMeal()}
            loading={editLoading}
            variant="secondary"
            fullWidth
          />

          <View style={{ gap: spacing[2] }}>
            {editItems.map((item, index) => (
              <View key={`${item.name}-${index}`} style={{ paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: 6 }}>{item.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] }}>
                  <Input
                    value={String(item.amount)}
                    onChangeText={(val) => updateEditItemAmount(index, val)}
                    keyboardType="decimal-pad"
                    containerStyle={{ flex: 1 }}
                  />
                  <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{item.unit}</Text>
                  <Text style={{ fontSize: fontSize.sm, color: palette.warning }}>{Math.round(item.calories)} kcal</Text>
                </View>
              </View>
            ))}
          </View>

          <Button
            label={editLoading ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            onPress={() => void handleSaveMealEdit()}
            loading={editLoading}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenBackground>
  )
}
