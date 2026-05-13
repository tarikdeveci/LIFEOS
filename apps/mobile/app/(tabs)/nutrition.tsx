import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, Modal, ActivityIndicator, Alert } from 'react-native'
import { useNutritionStore, MEAL_TYPE_LABELS, MEAL_TYPE_ICONS, useWorkoutStore, WORKOUT_STATUS_LABELS } from '@lifeos/shared'
import type { MealType, MealItem, Meal } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { todayDate } from '@lifeos/shared'
import { T, HEADER_BTN } from '@/src/theme'
import { GradientBackground } from '@/src/components/GradientBackground'

const MACRO_CONFIG = [
  { key: 'protein' as const, label: 'Protein', color: T.blockType.workout, unit: 'g' },
  { key: 'carbs'   as const, label: 'Karb',    color: T.warning, unit: 'g' },
  { key: 'fat'     as const, label: 'Yağ',     color: T.danger,  unit: 'g' },
  { key: 'fiber'   as const, label: 'Lif',     color: T.success, unit: 'g' },
]
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

interface MacroRate { calories: number; protein: number; carbs: number; fat: number; fiber: number }
function calcRate(item: MealItem): MacroRate {
  const a = item.amount || 1
  return { calories: item.calories / a, protein: item.protein / a, carbs: item.carbs / a, fat: item.fat / a, fiber: item.fiber / a }
}
function applyRate(rate: MacroRate, amount: number): Partial<MealItem> {
  return {
    amount,
    calories: Math.round(rate.calories * amount),
    protein:  Math.round(rate.protein  * amount * 10) / 10,
    carbs:    Math.round(rate.carbs    * amount * 10) / 10,
    fat:      Math.round(rate.fat      * amount * 10) / 10,
    fiber:    Math.round(rate.fiber    * amount * 10) / 10,
  }
}

type FoodResult = { name: string; calories: number; protein: number; carbs: number; fat: number; fiber: number; serving_size: number; serving_unit: string }

export default function NutritionScreen() {
  const today = todayDate()
  const [userId, setUserId]   = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [rawInput, setRawInput]         = useState('')
  const [selectedMealType, setSelectedMealType] = useState<MealType>('lunch')
  const [adding, setAdding]   = useState(false)
  // AI hesaplama sonucu önizleme
  const [preview, setPreview] = useState<{ calories: number; protein: number; carbs: number; fat: number; fiber: number } | null>(null)
  const [previewItems, setPreviewItems] = useState<MealItem[]>([])

  const [editingMeal, setEditingMeal]   = useState<Meal | null>(null)
  const [editItems, setEditItems]       = useState<MealItem[]>([])
  const [editRates, setEditRates]       = useState<MacroRate[]>([])
  const [editMealType, setEditMealType] = useState<MealType>('lunch')
  const [saving, setSaving]             = useState(false)

  const [foodSearch, setFoodSearch]   = useState('')
  const [foodResults, setFoodResults] = useState<FoodResult[]>([])
  const [quickAdd, setQuickAdd]       = useState<{ food: FoodResult; qty: number; mealType: MealType } | null>(null)
  const [quickAdding, setQuickAdding] = useState(false)
  const foodSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // AI Nutrition Chat
  interface ChatMsg { role: 'user' | 'assistant'; text: string }
  const [chatMsgs, setChatMsgs]       = useState<ChatMsg[]>([])
  const [chatInput, setChatInput]     = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatOpen, setChatOpen]       = useState(false)

  const { meals, dailySummary, target: nutritionTarget, loading, fetchDayNutrition, addMeal, editMeal, removeMeal } = useNutritionStore()
  const { todayWorkout, fetchTodayWorkout } = useWorkoutStore()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => { if (user) setUserId(user.id) })
  }, [])

  const loadData = useCallback(async (uid: string) => {
    await Promise.all([fetchDayNutrition(supabase, uid, today), fetchTodayWorkout(supabase, uid, today)])
  }, [today, fetchDayNutrition, fetchTodayWorkout])

  useEffect(() => { if (userId) void loadData(userId) }, [userId, loadData])

  const onRefresh = useCallback(async () => {
    if (!userId) return; setRefreshing(true); await loadData(userId); setRefreshing(false)
  }, [userId, loadData])

  const handleFoodSearch = useCallback((q: string) => {
    setFoodSearch(q)
    if (foodSearchTimer.current) clearTimeout(foodSearchTimer.current)
    if (!q.trim() || q.length < 2) { setFoodResults([]); return }
    foodSearchTimer.current = setTimeout(async () => {
      try {
        const qLower = q.toLowerCase().trim()
        const userFilter = userId ? `user_id.is.null,user_id.eq.${userId}` : 'user_id.is.null'
        const cols = 'name, calories, protein, carbs, fat, fiber, serving_size, serving_unit'
        const [{ data: byName }, { data: byAlias }] = await Promise.all([
          supabase.from('food_items').select(cols).or(userFilter)
            .ilike('name', `%${qLower}%`).order('is_verified', { ascending: false }).limit(15),
          supabase.from('food_items').select(cols).or(userFilter)
            .contains('aliases', [qLower]).order('is_verified', { ascending: false }).limit(10),
        ])
        const seen = new Set<string>()
        const merged: FoodResult[] = []
        for (const item of [...(byName ?? []), ...(byAlias ?? [])]) {
          const key = (item as FoodResult).name.toLowerCase()
          if (!seen.has(key)) { seen.add(key); merged.push(item as FoodResult) }
        }
        setFoodResults(merged.slice(0, 8))
      } catch { /* sessiz hata — search UI'ı bozulmasın */ }
    }, 300)
  }, [userId])

  const handleQuickAdd = useCallback(async () => {
    if (!quickAdd || !userId) return
    setQuickAdding(true)
    const ratio = quickAdd.qty / quickAdd.food.serving_size
    try {
      await addMeal(supabase, userId, {
        meal_type: quickAdd.mealType,
        raw_input: `${quickAdd.qty}${quickAdd.food.serving_unit} ${quickAdd.food.name}`,
        date: today,
        items: [{
          name: quickAdd.food.name, amount: quickAdd.qty, unit: quickAdd.food.serving_unit,
          calories: Math.round(quickAdd.food.calories * ratio),
          protein:  Math.round(quickAdd.food.protein  * ratio * 10) / 10,
          carbs:    Math.round(quickAdd.food.carbs    * ratio * 10) / 10,
          fat:      Math.round(quickAdd.food.fat      * ratio * 10) / 10,
          fiber:    Math.round((quickAdd.food.fiber ?? 0) * ratio * 10) / 10,
        }],
      })
      setQuickAdd(null); setFoodSearch(''); setFoodResults([])
    } catch { Alert.alert('Hata', 'Eklenemedi') }
    finally { setQuickAdding(false) }
  }, [quickAdd, userId, today, addMeal])

  // AI ile kalori hesapla, önizle
  const handleCalculate = useCallback(async () => {
    if (!userId || !rawInput.trim()) return
    setAdding(true)
    setPreview(null)
    try {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) { const { data: r } = await supabase.auth.refreshSession(); session = r.session }
      if (!session?.access_token) throw new Error('Oturum bulunamadı')

      const response = await fetch(
        `${process.env['EXPO_PUBLIC_SUPABASE_URL']}/functions/v1/parse-meal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ raw_input: rawInput.trim(), user_id: userId }),
        },
      )
      if (!response.ok) throw new Error()
      const data = await response.json()
      const items = (data.items ?? []) as MealItem[]
      setPreviewItems(items)
      const totals = items.reduce(
        (s, i) => ({ calories: s.calories + i.calories, protein: s.protein + i.protein, carbs: s.carbs + i.carbs, fat: s.fat + i.fat, fiber: s.fiber + i.fiber }),
        { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
      )
      setPreview(totals)
    } catch { Alert.alert('Hata', 'Hesaplama yapılamadı') }
    finally { setAdding(false) }
  }, [userId, rawInput])

  const handleAddMeal = useCallback(async () => {
    if (!userId || !rawInput.trim()) return
    setAdding(true)
    try {
      const items = previewItems.length > 0 ? previewItems : []
      await addMeal(supabase, userId, { meal_type: selectedMealType, raw_input: rawInput.trim(), items, date: today })
      setRawInput(''); setPreview(null); setPreviewItems([]); setShowAddModal(false)
    } catch { Alert.alert('Hata', 'Öğün eklenemedi') }
    finally { setAdding(false) }
  }, [userId, rawInput, selectedMealType, previewItems, addMeal, today])

  const openEdit = useCallback((meal: Meal) => {
    setEditingMeal(meal); setEditMealType(meal.meal_type)
    setEditItems(meal.items); setEditRates(meal.items.map(calcRate))
  }, [])

  const handleEditAmount = useCallback((idx: number, newAmt: number) => {
    const rate = editRates[idx]
    if (!rate || !newAmt) return
    setEditItems((items) => items.map((item, i) => i === idx ? { ...item, ...applyRate(rate, newAmt) } : item))
  }, [editRates])

  const handleSaveEdit = useCallback(async () => {
    if (!editingMeal) return
    setSaving(true)
    try { await editMeal(supabase, editingMeal.id, { meal_type: editMealType, items: editItems }); setEditingMeal(null) }
    catch { Alert.alert('Hata', 'Güncellenemedi') }
    finally { setSaving(false) }
  }, [editingMeal, editMealType, editItems, editMeal])

  const handleDeleteMeal = useCallback((mealId: string) => {
    Alert.alert('Öğün Sil', 'Bu öğünü silmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: () => void removeMeal(supabase, mealId) },
    ])
  }, [removeMeal])

  const handleSendChat = useCallback(async (overrideMsg?: string) => {
    const msg = overrideMsg ?? chatInput.trim()
    if (!msg || chatLoading || !userId) return
    setChatInput('')
    setChatMsgs((p) => [...p, { role: 'user', text: msg }])
    setChatLoading(true)
    try {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) { const { data: r } = await supabase.auth.refreshSession(); session = r.session }
      if (!session) throw new Error()

      const consumed = {
        calories: dailySummary?.calories ?? 0, protein: dailySummary?.protein ?? 0,
        carbs: dailySummary?.carbs ?? 0, fat: dailySummary?.fat ?? 0, fiber: dailySummary?.fiber ?? 0,
      }
      const tgt = {
        calories: nutritionTarget?.calories ?? 2000, protein: nutritionTarget?.protein ?? 150,
        carbs: nutritionTarget?.carbs ?? 250, fat: nutritionTarget?.fat ?? 70, fiber: nutritionTarget?.fiber ?? 25,
      }
      const meals_today = meals.map((m) => ({
        meal_type: m.meal_type,
        items: m.items.map((i) => ({ name: i.name, amount: i.amount, unit: i.unit, calories: i.calories })),
      }))

      const { data, error } = await supabase.functions.invoke('ai-suggest', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          type: 'nutrition_chat',
          user_message: msg,
          nutrition_context: { target: tgt, consumed, meals_today, history: chatMsgs.slice(-8) },
        },
      })
      if (error) throw error
      setChatMsgs((p) => [...p, { role: 'assistant', text: (data as { message: string }).message }])
    } catch {
      setChatMsgs((p) => [...p, { role: 'assistant', text: 'Bir hata oluştu.' }])
    } finally { setChatLoading(false) }
  }, [userId, dailySummary, nutritionTarget, meals, chatMsgs])

  const caloriePercent = dailySummary && nutritionTarget
    ? Math.min(100, Math.round((dailySummary.calories / nutritionTarget.calories) * 100)) : 0

  return (
    <GradientBackground>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, paddingTop: 56 }}>
        <Text style={{ fontSize: 28, fontWeight: '800', color: T.text.primary, letterSpacing: -0.5 }}>Beslenme</Text>
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={HEADER_BTN}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: T.btn.primary.text }}>+ Ögün</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}>
        {/* Kalori Özeti */}
        <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-5">
          {loading && !refreshing ? <ActivityIndicator color={T.accent} /> : (
            <>
              <View className="mb-2 flex-row items-end justify-between">
                <View>
                  <Text className="text-3xl font-bold text-primary">{dailySummary ? Math.round(dailySummary.calories) : 0}</Text>
                  <Text className="text-xs text-muted">kcal tüketildi</Text>
                </View>
                <View className="items-end">
                  <Text className="text-lg font-semibold text-muted">{nutritionTarget ? `/ ${nutritionTarget.calories}` : '/ —'}</Text>
                  <Text className="text-xs text-muted">hedef</Text>
                </View>
              </View>
              <View className="mb-4 h-3 overflow-hidden rounded-full bg-gray-100">
                <View className="h-3 rounded-full" style={{ width: `${caloriePercent}%`, backgroundColor: caloriePercent >= 100 ? T.danger : T.accent }} />
              </View>
              <View className="flex-row justify-between">
                {MACRO_CONFIG.map((m) => {
                  const current = dailySummary?.[m.key] ?? 0
                  const tgt = nutritionTarget?.[`${m.key}_g` as keyof typeof nutritionTarget] as number | undefined
                  const pct = tgt ? Math.min(100, Math.round((current / tgt) * 100)) : 0
                  return (
                    <View key={m.key} className="flex-1 items-center px-1">
                      <Text className="text-base font-bold text-primary">{Math.round(current)}<Text className="text-xs font-normal text-muted">{m.unit}</Text></Text>
                      <View className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <View className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: m.color }} />
                      </View>
                      <Text className="mt-0.5 text-xs text-muted">{m.label}</Text>
                    </View>
                  )
                })}
              </View>
            </>
          )}
        </View>

        {todayWorkout?.total_calories_burned && (
          <View style={{ marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, borderWidth: 1, borderColor: `${T.blockType.workout}25`, backgroundColor: `${T.blockType.workout}08`, paddingHorizontal: 16, paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 20 }}>💪</Text>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '500', color: T.blockType.workout }}>{todayWorkout.name ?? 'Antrenman'}</Text>
                <Text style={{ fontSize: 12, color: T.text.muted }}>{todayWorkout.total_calories_burned} kcal yakıldı</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: T.blockType.workout }}>Net: {Math.round((dailySummary?.calories ?? 0) - todayWorkout.total_calories_burned)} kcal</Text>
              <Text style={{ fontSize: 12, color: T.text.muted }}>{WORKOUT_STATUS_LABELS[todayWorkout.status]}</Text>
            </View>
          </View>
        )}

        {/* Yiyecek Ara & Ekle */}
        <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
          <Text className="mb-2 text-sm font-semibold text-primary">🔍 Yiyecek Ara & Ekle</Text>
          <TextInput value={foodSearch} onChangeText={handleFoodSearch} placeholder="Yumurta, tavuk, ekmek..."
            placeholderTextColor="#9CA3AF" className="rounded-xl border border-gray-200 px-3 py-2 text-primary" />
          {foodResults.map((food, i) => (
            <View key={i}>
              <View className="mt-2 flex-row items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                <View className="flex-1">
                  <Text className="text-xs font-medium text-primary">{food.name}</Text>
                  <Text className="text-[10px] text-muted">{food.serving_size}{food.serving_unit} · P:{Math.round(food.protein)}g K:{Math.round(food.carbs)}g Y:{Math.round(food.fat)}g</Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs font-semibold text-accent">{Math.round(food.calories)} kcal</Text>
                  <TouchableOpacity onPress={() => setQuickAdd(quickAdd?.food.name === food.name ? null : { food, qty: food.serving_size, mealType: 'lunch' })}
                    className="rounded-full px-2 py-1" style={{ backgroundColor: quickAdd?.food.name === food.name ? T.danger : T.btn.secondary.bg }}>
                    <Text className="text-xs font-bold" style={{ color: quickAdd?.food.name === food.name ? 'white' : T.text.accent }}>
                      {quickAdd?.food.name === food.name ? '✕' : '+'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {quickAdd?.food.name === food.name && (
                <View style={{ marginHorizontal: 4, marginBottom: 8, marginTop: 4, borderRadius: 12, borderWidth: 1, borderColor: T.btn.secondary.border, backgroundColor: T.btn.secondary.bg, padding: 12 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    {MEAL_TYPES.map((type) => (
                      <TouchableOpacity key={type} onPress={() => setQuickAdd((q) => q ? { ...q, mealType: type } : q)}
                        style={{ marginRight: 8, flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: quickAdd.mealType === type ? T.accent : T.card.bg }}>
                        <Text style={{ marginRight: 4, fontSize: 12 }}>{MEAL_TYPE_ICONS[type]}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '500', color: quickAdd.mealType === type ? 'white' : T.text.muted }}>{MEAL_TYPE_LABELS[type]}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View className="flex-row items-center gap-2">
                    <TextInput value={String(quickAdd.qty)} onChangeText={(v) => setQuickAdd((q) => q ? { ...q, qty: parseFloat(v) || q.food.serving_size } : q)}
                      keyboardType="decimal-pad" className="w-20 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-primary" />
                    <Text className="text-xs text-muted">{food.serving_unit}</Text>
                    <Text className="flex-1 text-center text-xs font-semibold text-accent">≈{Math.round(food.calories * quickAdd.qty / food.serving_size)} kcal</Text>
                    <TouchableOpacity onPress={() => void handleQuickAdd()} disabled={quickAdding} className="rounded-xl bg-accent px-3 py-2" style={{ opacity: quickAdding ? 0.6 : 1 }}>
                      <Text className="text-xs font-semibold text-white">{quickAdding ? '…' : 'Ekle'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
          {foodSearch.length >= 2 && foodResults.length === 0 && <Text className="mt-2 text-center text-xs text-muted">Sonuç bulunamadı</Text>}
        </View>

        {/* Öğün Listesi */}
        <View className="mb-8">
          <Text className="mb-2 text-sm font-semibold text-muted">Bugünün Öğünleri</Text>
          {meals.length === 0 ? (
            <View className="items-center rounded-2xl border border-gray-100 bg-surface py-8">
              <Text className="text-3xl">🍽️</Text>
              <Text className="mt-2 text-muted">Henüz öğün eklenmedi</Text>
            </View>
          ) : (
            meals.map((meal) => (
              <View key={meal.id} className="mb-2 rounded-2xl border border-gray-100 bg-surface px-4 py-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1">
                    <Text className="mr-2 text-xl">{MEAL_TYPE_ICONS[meal.meal_type]}</Text>
                    <View className="flex-1">
                      <Text className="font-medium text-primary">{MEAL_TYPE_LABELS[meal.meal_type]}</Text>
                      {meal.raw_input && <Text className="text-xs text-muted" numberOfLines={1}>{meal.raw_input}</Text>}
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Text className="font-semibold text-accent">{Math.round(meal.total_calories)} kcal</Text>
                    <TouchableOpacity onPress={() => openEdit(meal)} className="rounded-lg border border-gray-200 px-2 py-1">
                      <Text className="text-[10px] font-medium text-muted">Düzenle</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteMeal(meal.id)} className="px-1 py-1">
                      <Text className="text-base font-bold text-muted/40">×</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="mt-2 flex-row gap-3">
                  <Text className="text-xs text-muted">P: {Math.round(meal.total_protein)}g</Text>
                  <Text className="text-xs text-muted">K: {Math.round(meal.total_carbs)}g</Text>
                  <Text className="text-xs text-muted">Y: {Math.round(meal.total_fat)}g</Text>
                </View>
              </View>
            ))
          )}
        </View>

        {/* AI Beslenme Koçu */}
        <View style={{ marginBottom: 32, borderRadius: 20, backgroundColor: T.card.bg, borderWidth: 1, borderColor: T.card.border, shadowColor: T.card.shadowColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 3, padding: 16 }}>
          {/* Header */}
          <TouchableOpacity onPress={() => setChatOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ fontWeight: '700', color: T.text.primary, fontSize: 13 }}>🥗 Beslenme Koçu</Text>
              {dailySummary && nutritionTarget && (
                <Text style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>
                  Kalan: {Math.max(0, Math.round(nutritionTarget.calories - dailySummary.calories))} kcal ·
                  P {Math.max(0, Math.round(nutritionTarget.protein - dailySummary.protein))}g ·
                  K {Math.max(0, Math.round(nutritionTarget.carbs - dailySummary.carbs))}g
                </Text>
              )}
            </View>
            <Text style={{ fontSize: 14, color: T.text.subtle }}>{chatOpen ? '▾' : '▸'}</Text>
          </TouchableOpacity>

          {chatOpen && (
            <>
              {/* Hızlı sorular */}
              {chatMsgs.length === 0 && (
                <View style={{ marginTop: 12, gap: 6 }}>
                  {['Ne yiyebilirim?', 'Protein açığımı kapat', 'Akşam için öneri'].map((q) => (
                    <TouchableOpacity key={q} onPress={() => void handleSendChat(q)}
                      style={{ borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: T.btn.secondary.bg, borderWidth: 1, borderColor: T.btn.secondary.border }}>
                      <Text style={{ fontSize: 12, color: T.text.accent, fontWeight: '500' }}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Mesajlar */}
              {chatMsgs.length > 0 && (
                <View style={{ marginTop: 12, gap: 8 }}>
                  {chatMsgs.map((msg, i) => (
                    <View key={i} style={{
                      borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8,
                      backgroundColor: msg.role === 'user' ? T.btn.secondary.bg : T.btn.pill.bg,
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '90%',
                    }}>
                      <Text style={{ fontSize: 12, color: msg.role === 'user' ? T.text.accent : T.text.primary, lineHeight: 18 }}>
                        {msg.text}
                      </Text>
                    </View>
                  ))}
                  {chatLoading && (
                    <View style={{ borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: T.btn.pill.bg, alignSelf: 'flex-start' }}>
                      <Text style={{ fontSize: 12, color: T.text.subtle }}>···</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Input */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TextInput
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="Ne yiyebilirim?..."
                  placeholderTextColor="#9CA3AF"
                  style={{ flex: 1, borderWidth: 1, borderColor: T.input.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: T.input.text, backgroundColor: T.input.bg }}
                  onSubmitEditing={() => void handleSendChat()}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  onPress={() => void handleSendChat()}
                  disabled={chatLoading || !chatInput.trim()}
                  style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: T.accent, justifyContent: 'center', opacity: chatLoading || !chatInput.trim() ? 0.4 : 1 }}
                >
                  <Text style={{ fontSize: 14, color: 'white', fontWeight: '700' }}>→</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {/* Add Modal — yeni flow: yaz → hesapla → kaydet */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: 'white', padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: T.text.primary, marginBottom: 16 }}>Ne yedin?</Text>

            {/* Öğün tipi */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {MEAL_TYPES.map((type) => (
                <TouchableOpacity key={type} onPress={() => { setSelectedMealType(type); setPreview(null) }}
                  style={{ marginRight: 8, flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8,
                    backgroundColor: selectedMealType === type ? T.accent : T.btn.pill.bg }}>
                  <Text style={{ marginRight: 4 }}>{MEAL_TYPE_ICONS[type]}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: selectedMealType === type ? 'white' : T.text.muted }}>{MEAL_TYPE_LABELS[type]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Metin girişi */}
            <TextInput
              value={rawInput}
              onChangeText={(t) => { setRawInput(t); setPreview(null) }}
              placeholder="örn: sabah kahvaltısında 2 yumurta, 2 dilim ekmek, peynir ve domates yedim"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              autoFocus
              style={{ borderWidth: 1, borderColor: T.input.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12,
                fontSize: 14, color: T.input.text, minHeight: 80, textAlignVertical: 'top' }}
            />

            {/* AI Önizleme */}
            {preview && (
              <View style={{ backgroundColor: `${T.accent}08`, borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: T.text.accent, marginBottom: 6 }}>🤖 AI Tahmini:</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 20, fontWeight: 'bold', color: T.text.primary }}>{Math.round(preview.calories)}</Text>
                    <Text style={{ fontSize: 10, color: T.text.muted }}>kcal</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: T.blockType.workout }}>{Math.round(preview.protein)}g</Text>
                    <Text style={{ fontSize: 10, color: T.text.muted }}>Protein</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: T.warning }}>{Math.round(preview.carbs)}g</Text>
                    <Text style={{ fontSize: 10, color: T.text.muted }}>Karb</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: T.danger }}>{Math.round(preview.fat)}g</Text>
                    <Text style={{ fontSize: 10, color: T.text.muted }}>Yağ</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: T.success }}>{Math.round(preview.fiber)}g</Text>
                    <Text style={{ fontSize: 10, color: T.text.muted }}>Lif</Text>
                  </View>
                </View>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => { setShowAddModal(false); setRawInput(''); setPreview(null); setPreviewItems([]) }}
                style={{ flex: 1, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: T.input.border, paddingVertical: 14 }}>
                <Text style={{ fontWeight: '600', color: '#6B7280' }}>İptal</Text>
              </TouchableOpacity>

              {!preview ? (
                <TouchableOpacity onPress={() => void handleCalculate()} disabled={!rawInput.trim() || adding}
                  style={{ flex: 2, alignItems: 'center', borderRadius: 12, backgroundColor: T.accent, paddingVertical: 14, opacity: !rawInput.trim() || adding ? 0.5 : 1 }}>
                  {adding ? <ActivityIndicator size="small" color="white" /> : <Text style={{ fontWeight: '600', color: 'white' }}>🤖 AI ile Hesapla</Text>}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => void handleAddMeal()} disabled={adding}
                  style={{ flex: 2, alignItems: 'center', borderRadius: 12, backgroundColor: T.success, paddingVertical: 14, opacity: adding ? 0.5 : 1 }}>
                  {adding ? <ActivityIndicator size="small" color="white" /> : <Text style={{ fontWeight: '600', color: 'white' }}>✓ Kaydet</Text>}
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal */}
      <Modal visible={!!editingMeal} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-3xl bg-surface p-6" style={{ maxHeight: '80%' }}>
            <Text className="mb-4 text-lg font-bold text-primary">Öğünü Düzenle</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              {MEAL_TYPES.map((type) => (
                <TouchableOpacity key={type} onPress={() => setEditMealType(type)} className="mr-2 flex-row items-center rounded-xl px-3 py-2"
                  style={{ backgroundColor: editMealType === type ? T.accent : T.btn.pill.bg }}>
                  <Text className="mr-1">{MEAL_TYPE_ICONS[type]}</Text>
                  <Text className="text-sm font-medium" style={{ color: editMealType === type ? 'white' : T.text.muted }}>{MEAL_TYPE_LABELS[type]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView className="mb-4 max-h-64">
              {editItems.map((item, idx) => (
                <View key={idx} className="mb-2 flex-row items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2">
                  <Text className="flex-1 text-xs font-medium text-primary" numberOfLines={1}>{item.name}</Text>
                  <TextInput value={String(item.amount)} onChangeText={(v) => handleEditAmount(idx, parseFloat(v) || 0)}
                    keyboardType="decimal-pad" className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-xs text-primary" />
                  <Text className="text-[10px] text-muted">{item.unit}</Text>
                  <Text className="w-12 text-right text-xs font-semibold text-accent">{item.calories}kcal</Text>
                  <TouchableOpacity onPress={() => { setEditItems((i) => i.filter((_, xi) => xi !== idx)); setEditRates((r) => r.filter((_, xi) => xi !== idx)) }}>
                    <Text className="text-base font-bold text-muted/40">×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setEditingMeal(null)} className="flex-1 items-center rounded-xl border border-gray-200 py-3">
                <Text className="font-medium text-muted">İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void handleSaveEdit()} disabled={saving}
                className="flex-1 items-center rounded-xl bg-accent py-3" style={{ opacity: saving ? 0.5 : 1 }}>
                {saving ? <ActivityIndicator size="small" color="white" /> : <Text className="font-semibold text-white">Güncelle</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </GradientBackground>
  )
}
