import { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, Keyboard } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { supabase } from '@/src/lib/supabase'
import { aiErrorMessage, callAiSuggest, callParseMeal } from '@/src/lib/ai'
import { recordValueMoment } from '@/src/lib/review'
import { rescaleItemToAmount, todayDate, useNutritionStore } from '@lifeos/shared'
import type {
  MealType,
  Meal,
  MealItem,
  MealQuestion,
  ParseTraceEntry,
  QuestionChoice,
  FoodSearchResult,
  NutritionFeedbackKind,
} from '@lifeos/shared'
import {
  buildItemFromChoice,
  createFoodItem,
  saveFoodAlias,
  savePortionMemory,
  searchFoodChoices,
  submitNutritionFeedback,
} from '@lifeos/shared/supabase'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { ProgressBar } from '@/src/components/ui/ProgressBar'
import { StatCard } from '@/src/components/ui/StatCard'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { ScreenHeader } from '@/src/components/ui/ScreenHeader'
import { FoodChoiceAmount } from '@/src/components/nutrition/FoodChoiceAmount'
import { portionRungLabel } from '@/src/utils/portionRung'
import { ManualMacroForm } from '@/src/components/nutrition/ManualMacroForm'
import { AiChatSheet, type AiChatMessage } from '@/src/components/ai/AiChatSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { useKeyboardScrollIntoView } from '@/src/hooks/useKeyboardScrollIntoView'
import { useProGate } from '@/src/hooks/useProGate'
import { useAiHint } from '@/src/hooks/useAiHint'
import { AiHint } from '@/src/components/ai/AiHint'
import { palette, fontSize, fontWeight, spacing, radius, MIN_TOUCH } from '@/src/theme/tokens'

/** ai-suggest'in beslenme koçundan dönen aksiyon. */
interface CoachAction { action: 'log_meal'; meal_type: MealType; text: string }

function questionKey(question: MealQuestion): string {
  return `${question.kind}:${question.phrase}:${question.raw}`
}

function resolveTraceQuestion(
  entries: ParseTraceEntry[] | null,
  question: MealQuestion,
  item: MealItem,
): ParseTraceEntry[] | null {
  if (!entries) return null
  return entries.map((entry) => entry.phrase === question.phrase && entry.raw === question.raw
    ? {
        ...entry,
        resolve_rung: item.resolve_rung ?? 'user_alias',
        portion_rung: item.portion_rung ?? 'unknown',
        confidence: item.confidence ?? 0.95,
      }
    : entry)
}

export default function NutritionScreen() {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const bottomPadding = useBottomTabPadding()
  const scrollRef = useKeyboardScrollIntoView()
  const { meals, target, dailySummary, fetchDayNutrition, addMeal, editMeal, removeMeal, error: nutritionError } = useNutritionStore()

  const MEAL_TYPES: { key: MealType; label: string }[] = [
    { key: 'breakfast', label: t.nutr_breakfast },
    { key: 'lunch',     label: t.nutr_lunch },
    { key: 'dinner',    label: t.nutr_dinner },
    { key: 'snack',     label: t.nutr_snack },
  ]
  const [userId, setUserId] = useState<string | null>(null)
  const { isPro, isCheckingPro, requirePro } = useProGate(userId)
  const [refreshing, setRefreshing] = useState(false)
  // İlk okuma bitmeden gün boş görünür; ipucu o arada çıkmasın.
  const [loaded, setLoaded] = useState(false)

  // Add modal
  const [showAdd, setShowAdd] = useState(false)
  const [rawInput, setRawInput] = useState('')
  const [mealType, setMealType] = useState<MealType>('lunch')
  const [parsing, setParsing] = useState(false)
  const [parsedItems, setParsedItems] = useState<MealItem[] | null>(null)
  // Kalemlerin DÜZENLENMEMİŞ hâli. Gramaj her değiştiğinde oranlama buradan
  // yapılır, bir önceki düzenlemeden değil: "2" → "20" → "200" yazan biri
  // zincirleme oranlamada üç kez yuvarlanmış bir kalori görür.
  const [parsedBase, setParsedBase] = useState<MealItem[]>([])
  const [parsedQuestions, setParsedQuestions] = useState<MealQuestion[]>([])
  const [itemApprovals, setItemApprovals] = useState<boolean[]>([])
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({})
  const [parseTrace, setParseTrace] = useState<ParseTraceEntry[] | null>(null)
  const [parseVersion, setParseVersion] = useState<string | null>(null)
  // Model katmanı çalışmadıysa nedeni: 'budget' aylık AI sınırı doldu, 'down' sağlayıcı hatası
  const [aiDegraded, setAiDegraded] = useState<'budget' | 'down' | null>(null)
  const [adding, setAdding] = useState(false)

  // "Bu yanlış" bildirimi. Hattın soru sorduğu kalemler zaten food_gaps'e
  // düşüyor; buradaki amaç hattın EMİN olduğu ama yanıldığı kalemleri
  // yakalamak — başka hiçbir yerde iz bırakmıyorlar.
  const [feedbackFor, setFeedbackFor] = useState<number | null>(null)
  const [feedbackSent, setFeedbackSent] = useState<Record<number, boolean>>({})

  // Food search
  const [foodSearch, setFoodSearch] = useState('')
  const [foodResults, setFoodResults] = useState<FoodSearchResult[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Elle ekleme akışı — model çağrısı yok, ücretsiz kullanıcı için de açık.
  const [addMode, setAddMode] = useState<'text' | 'search' | 'manual'>('text')
  const [pendingChoice, setPendingChoice] = useState<FoodSearchResult | null>(null)

  /**
   * Kendi yaptığın yemeği kişisel veritabanına kaydetme.
   *
   * "Kafama göre bir şey pişirdim" durumunun cevabı: içine ne girdiğini zaten
   * biliyorsun. Kalemleri normal akışla (metin ya da arama) topluyoruz, sonra
   * ada ve porsiyon sayısına bağlayıp tek satıra dönüştürüyoruz. Böylece besin
   * değeri yine gerçek veritabanı satırlarının TOPLAMI oluyor — model tahmini
   * değil. Bir dahaki sefere yemeğin adını yazman yetiyor.
   */
  const [showSaveRecipe, setShowSaveRecipe] = useState(false)
  const [recipeName, setRecipeName] = useState('')
  const [recipePortions, setRecipePortions] = useState('1')
  const [savingRecipe, setSavingRecipe] = useState(false)

  // Edit modal
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null)
  const [editRawInput, setEditRawInput] = useState('')
  const [editItems, setEditItems] = useState<MealItem[]>([])
  const [editBase, setEditBase] = useState<MealItem[]>([])
  const [editApprovals, setEditApprovals] = useState<boolean[]>([])
  const [editTrace, setEditTrace] = useState<ParseTraceEntry[] | null>(null)
  const [editVersion, setEditVersion] = useState<string | null>(null)
  const [editLoading, setEditLoading] = useState(false)

  // AI Chat
  const [showChat, setShowChat] = useState(false)
  const [chatMsgs, setChatMsgs] = useState<AiChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const todayStr = todayDate()

  const load = useCallback(async (uid: string) => {
    await fetchDayNutrition(supabase, uid, todayStr)
  }, [todayStr, fetchDayNutrition])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUserId(data.user.id); void load(data.user.id).finally(() => setLoaded(true)) }
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
    if (!q.trim() || !userId) { setFoodResults([]); return }
    const uid = userId
    searchTimer.current = setTimeout(async () => {
      try {
        setFoodResults(await searchFoodChoices(supabase, q, uid, 12))
      } catch {
        setFoodResults([])
      }
    }, 300)
  }

  /**
   * Aramadan seçilen satırı öğün sepetine ekler. Besin değeri yine veritabanı
   * satırından hesaplanır; model çağrısı yok, bu yüzden ücretsiz kullanıcıda da
   * çalışır. Kullanıcı satırı bizzat seçtiği için ayrıca onay istenmez.
   */
  /** Seçilen besini gramajıyla öğüne ekler; hata kartın içinde gösterilir. */
  async function handleAddChoice(grams: number): Promise<boolean> {
    if (!pendingChoice || !userId) return false
    try {
      const item = await buildItemFromChoice(supabase, pendingChoice, grams)
      appendParsedItem(item)
      setItemApprovals((approvals) => [...approvals, true])
      // Seçim + gramaj kullanıcının alışkanlığı olarak hatırlanır; bir dahaki
      // sefere serbest metin hattı da aynı satırı bulur.
      await saveFoodAlias(supabase, userId, pendingChoice.label,
        pendingChoice.source === 'curated'
          ? { food_item_id: pendingChoice.id }
          : { corpus_fdc_id: pendingChoice.id })
      await savePortionMemory(supabase, userId, pendingChoice.label, grams)
      setPendingChoice(null)
      setFoodSearch('')
      setFoodResults([])
      return true
    } catch {
      return false
    }
  }

  /** Elle girilen kalem (#25): onay gerektirmez, kullanıcının kendi değeri. */
  function handleAddManual(item: MealItem) {
    appendParsedItem(item)
    setItemApprovals((approvals) => [...approvals, true])
  }

  function openManualAdd(choice: FoodSearchResult) {
    setAddMode('search')
    setPendingChoice(choice)
    setShowAdd(true)
  }

  // Silme onaysız gitmesin (UX: silme onay veya geri al ister, #39).
  function confirmRemoveMeal(mealId: string) {
    const tr = lang === 'tr'
    Alert.alert(t.nut_del_meal_title, t.nut_del_meal_msg, [
      { text: t.nut_cancel, style: 'cancel' },
      { text: t.nut_delete, style: 'destructive', onPress: () => void removeMeal(supabase, mealId) },
    ])
  }

  function openEditMeal(meal: Meal) {
    const items = meal.items ?? []
    setEditingMeal(meal)
    setEditRawInput(meal.raw_input ?? '')
    setEditItems(items)
    setEditBase(items)
    setEditApprovals(items.map((item) => item.disposition !== 'confirm'))
    setEditTrace(meal.parse_trace ?? null)
    setEditVersion(meal.parse_version ?? null)
  }

  /** Kaydedilmiş öğündeki bir kalemin gramajı. */
  function updateEditItemAmount(index: number, nextAmount: number) {
    const base = editBase[index]
    if (!base) return
    setEditItems((items) => items.map((item, i) => i === index ? rescaleItemToAmount(base, nextAmount) : item))
  }

  /** Henüz kaydedilmemiş (önizlemedeki) kalemin gramajı. */
  function updateParsedItemAmount(index: number, nextAmount: number) {
    const base = parsedBase[index]
    if (!base) return
    setParsedItems((items) =>
      (items ?? []).map((item, i) => i === index ? rescaleItemToAmount(base, nextAmount) : item))
  }

  /** Kalem listesine ekleme: taban kopya da birlikte büyür, indeksler kaymaz. */
  function appendParsedItem(item: MealItem) {
    setParsedItems((items) => [...(items ?? []), item])
    setParsedBase((base) => [...base, item])
  }

  async function handleSaveMealEdit() {
    if (!editingMeal) return
    if (editApprovals.some((approved) => !approved)) {
      Alert.alert(t.nut_approval_required_title, t.nut_approval_required_msg)
      return
    }
    setEditLoading(true)
    try {
      await editMeal(supabase, editingMeal.id, {
        raw_input: editRawInput.trim(),
        items: editItems,
        ...(editTrace ? { parse_trace: editTrace } : {}),
        ...(editVersion ? { parse_version: editVersion } : {}),
      })
      setEditingMeal(null)
      setEditItems([])
      setEditBase([])
      setEditApprovals([])
      setEditTrace(null)
      setEditVersion(null)
      setEditRawInput('')
      if (userId) await load(userId)
    } catch {
      Alert.alert(t.nut_err_edit_meal_title, t.nut_err_edit_meal_msg)
    } finally {
      setEditLoading(false)
    }
  }

  async function handleReparseEditMeal() {
    if (!editingMeal || !userId || !editRawInput.trim()) return
    setEditLoading(true)
    Keyboard.dismiss()
    try {
      const result = await callParseMeal({ raw_input: editRawInput.trim(), user_id: userId })
      setEditItems(result.items)
      setEditBase(result.items)
      setEditApprovals(result.items.map((item) => item.disposition !== 'confirm'))
      setEditTrace(result.trace)
      setEditVersion(result.version)
      if (result.questions.length > 0) {
        Alert.alert(t.nut_check_required_title, t.nut_check_required_msg.replace('{n}', String(result.questions.length)))
      }
    } catch {
      Alert.alert(t.nut_err_reparse_meal_title, t.nut_err_reparse_meal_msg)
    } finally {
      setEditLoading(false)
    }
  }

  async function handleParse() {
    if (!rawInput.trim() || !userId) return
    setParsing(true)
    setParsedItems(null)
    setParsedBase([])
    setParsedQuestions([])
    setItemApprovals([])
    setFeedbackFor(null)
    setFeedbackSent({})
    // Tekrar hesaplama temiz sayfadan başlar: önceki turun yarım kalan gramaj
    // taslakları ve izi yeni sonuca karışmamalı.
    setAmountDrafts({})
    setParseTrace(null)
    // Yazma bitti, sıra kontrolde: klavye kapanınca sayfa ~300px büyüyor ve
    // çözümleme sonuçları dar bir şeride sıkışmak yerine bir bakışta görünüyor.
    Keyboard.dismiss()
    try {
      const result = await callParseMeal({ raw_input: rawInput, user_id: userId })
      setParsedItems(result.items)
      setParsedBase(result.items)
      setParsedQuestions(result.questions)
      setItemApprovals(result.items.map((item) => item.disposition !== 'confirm'))
      setParseTrace(result.trace)
      setParseVersion(result.version)
      setAiDegraded(result.ai.pro && !result.ai.enabled ? (result.ai.error === 'budget' ? 'budget' : 'down') : null)
    } catch {
      Alert.alert(t.nut_err_parse_meal_title, t.nut_err_parse_meal_msg)
    } finally {
      setParsing(false)
    }
  }

  /**
   * Şu anki kalem listesini kişisel bir yiyecek satırına dönüştürür.
   *
   * Gramaj şartı bilerek katı: bir kalemin ağırlığı bilinmiyorsa porsiyon
   * ağırlığı da bilinmiyor demektir, o satırdan sonra yapılacak her ölçekleme
   * (100 g'a çevirme, gramaj değiştirme) sessizce yanlış sonuç verir. Uydurmak
   * yerine kullanıcıya söylüyoruz.
   */
  async function handleSaveRecipe() {
    const items = parsedItems ?? []
    if (!userId || savingRecipe || items.length === 0) return

    const name = recipeName.trim()
    if (name.length < 2) {
      Alert.alert(t.nut_name_required_title, t.nut_name_required_msg)
      return
    }

    const missingGrams = items.filter((item) => !item.grams || item.grams <= 0)
    if (missingGrams.length > 0) {
      Alert.alert(t.nut_grams_missing_title, t.nut_grams_missing_msg.replace('{items}', missingGrams.map((i) => i.name).join(', ')))
      return
    }

    const portions = Math.max(0.5, parseFloat(recipePortions.replace(',', '.')) || 1)
    const totalGrams = items.reduce((sum, item) => sum + (item.grams ?? 0), 0)
    const servingSize = Math.round(totalGrams / portions)
    if (servingSize <= 0) {
      Alert.alert(t.nut_calc_failed_title, t.nut_calc_failed_msg)
      return
    }

    const per = (pick: (item: MealItem) => number, decimals: number) => {
      const total = items.reduce((sum, item) => sum + pick(item), 0) / portions
      const factor = 10 ** decimals
      return Math.round(total * factor) / factor
    }

    setSavingRecipe(true)
    try {
      await createFoodItem(supabase, userId, {
        name,
        aliases: [name.toLocaleLowerCase('tr')],
        serving_size: servingSize,
        serving_unit: 'g',
        calories: Math.round(per((i) => i.calories, 0)),
        protein: per((i) => i.protein, 1),
        carbs: per((i) => i.carbs, 1),
        fat: per((i) => i.fat, 1),
        fiber: per((i) => i.fiber, 1),
        category: null,
      })

      setShowSaveRecipe(false)
      setRecipeName('')
      setRecipePortions('1')
      Alert.alert(t.nut_meal_saved_title, t.nut_meal_saved_msg.replace('{name}', name).replace('{servingSize}', String(servingSize)).replace('{kcal}', String(Math.round(per((i) => i.calories, 0)))))
    } catch (error) {
      console.warn('Tarif kaydedilemedi:', error)
      Alert.alert(t.nut_err_save_recipe_title, t.nut_err_save_recipe_msg)
    } finally {
      setSavingRecipe(false)
    }
  }

  /**
   * Sheet'i kapatır ve taslağın tamamını sıfırlar (#38). Metin, mod ve seçili arama sonucu da
   * temizlenir: yarım temizlik yeniden açılışta eski metinden hesap yaptırıyordu.
   */
  function closeMealSheet() {
    setShowAdd(false)
    setRawInput('')
    setAddMode('text')
    setParsedItems(null)
    setParsedBase([])
    setParsedQuestions([])
    setItemApprovals([])
    setFeedbackFor(null)
    setFeedbackSent({})
    setAmountDrafts({})
    setParseTrace(null)
    setParseVersion(null)
    setAiDegraded(null)
    setPendingChoice(null)
    setFoodSearch('')
    setFoodResults([])
  }

  async function handleAddMeal() {
    if (!userId) return
    if (itemApprovals.some((approved) => !approved)) {
      Alert.alert(t.nut_approval_required_title, t.nut_approval_required_msg)
      return
    }
    setAdding(true)
    try {
      const items = parsedItems ?? []
      // Elle ekleme akışında serbest metin girilmez; kalem adları özet olur.
      const summary = rawInput.trim() || items.map((item) => item.name).join(', ')
      await addMeal(supabase, userId, {
        date: todayStr, meal_type: mealType, raw_input: summary,
        items,
        ...(parseTrace ? { parse_trace: parseTrace } : {}),
        ...(parseVersion ? { parse_version: parseVersion } : {}),
      })
      closeMealSheet()
      // Öğün kaydedildi — kullanıcının uygulamadan değer gördüğü an. Beklenmez:
      // puanlama istemi kaydın tamamlanmasını geciktirmemeli.
      void recordValueMoment()
    } catch { Alert.alert(t.nut_err_add_meal_title, t.nut_err_add_meal_msg) }
    finally { setAdding(false) }
  }

  /**
   * Tek dokunuşla bildirim: serbest metin istemez. Etiket, gramaj, kalori ve
   * çözümleme izi o anki hâliyle dondurulur — sözlük sonradan düzelse bile
   * neyin şikâyet edildiği okunabilir kalır. Hata olursa öğün akışı bozulmaz.
   */
  async function sendItemFeedback(index: number, item: MealItem, kind: NutritionFeedbackKind) {
    if (!userId) return
    setFeedbackFor(null)
    setFeedbackSent((sent) => ({ ...sent, [index]: true }))

    const phrase = item.phrase ?? item.name
    try {
      await submitNutritionFeedback(supabase, userId, {
        raw_input: rawInput.trim() || null,
        phrase,
        item_label: item.name,
        item_source: item.source === 'corpus' ? 'corpus' : 'curated',
        item_ref_id: item.corpus_fdc_id ?? item.food_item_id ?? null,
        item_grams: item.grams ?? item.amount,
        item_kcal: item.calories,
        kind,
        parse_version: parseVersion,
        trace: parseTrace?.find((entry) => entry.phrase === phrase) ?? null,
      })
    } catch {
      setFeedbackSent((sent) => ({ ...sent, [index]: false }))
      Alert.alert(t.nut_err_send_feedback_title, t.nut_err_send_feedback_msg)
    }
  }

  function dismissQuestion(index: number, key: string) {
    setParsedQuestions((questions) => questions.filter((_, questionIndex) => questionIndex !== index))
    setAmountDrafts((drafts) => {
      const next = { ...drafts }
      delete next[key]
      return next
    })
  }

  async function handleQuestionChoice(index: number, question: MealQuestion, choice: QuestionChoice) {
    if (!userId) return
    try {
      const item = await buildItemFromChoice(supabase, choice)
      await saveFoodAlias(
        supabase,
        userId,
        question.phrase,
        choice.source === 'curated' ? { food_item_id: choice.id } : { corpus_fdc_id: choice.id },
      )
      appendParsedItem({ ...item, phrase: question.phrase })
      setItemApprovals((approvals) => [...approvals, true])
      setParseTrace((entries) => resolveTraceQuestion(entries, question, item))
      dismissQuestion(index, questionKey(question))
    } catch {
      Alert.alert(t.nut_err_apply_choice_title, t.nut_err_apply_choice_msg)
    }
  }

  async function handleQuestionAmount(index: number, question: MealQuestion) {
    if (!userId) return
    const key = questionKey(question)
    const grams = Number((amountDrafts[key] ?? '').replace(',', '.'))
    const id = question.food_item_id ?? question.corpus_fdc_id
    if (!Number.isFinite(grams) || grams <= 0 || !id) return

    try {
      const item = await buildItemFromChoice(
        supabase,
        {
          id,
          source: question.food_item_id ? 'curated' : 'corpus',
          label: question.food_label ?? question.phrase,
          kcal_per_100g: 0,
        },
        grams,
      )
      await savePortionMemory(supabase, userId, question.phrase, grams)
      const resolvedItem: MealItem = {
        ...item,
        phrase: question.phrase,
        resolve_rung: question.resolve_rung ?? item.resolve_rung,
        disposition: question.resolve_rung === 'corpus_verified' ? 'confirm' : 'auto',
        confidence: question.resolve_rung === 'corpus_verified' ? 0.6 : item.confidence,
      }
      appendParsedItem(resolvedItem)
      setItemApprovals((approvals) => [...approvals, resolvedItem.disposition !== 'confirm'])
      setParseTrace((entries) => resolveTraceQuestion(entries, question, resolvedItem))
      dismissQuestion(index, key)
    } catch {
      Alert.alert(t.nut_err_apply_amount_title, t.nut_err_apply_amount_msg)
    }
  }

  /**
   * Koçun önerdiği öğünü besin çözümleyicisinden geçirip güne kaydeder.
   * Koç serbest metin üretiyor ("180g yoğurt, 30g ceviz"); aynı hat elle
   * eklemede de kullanıldığı için makrolar tutarlı çıkıyor.
   */
  async function logMealFromCoach(mealTypeForLog: MealType, text: string) {
    if (!userId) return
    const result = await callParseMeal({ raw_input: text, user_id: userId })
    if (result.items.length === 0) throw new Error(t.nut_err_parse_meal_msg)
    await addMeal(supabase, userId, {
      date: todayStr,
      meal_type: mealTypeForLog,
      raw_input: text,
      items: result.items,
      ...(result.trace ? { parse_trace: result.trace } : {}),
      ...(result.version ? { parse_version: result.version } : {}),
    })
  }

  async function sendChat(text: string) {
    const trimmed = text.trim()
    if (!trimmed || !userId || chatLoading) return
    if (!requirePro('nutrition_chat')) return

    // Geçmiş, kullanıcının yeni mesajı eklenmeden önce alınır: sunucu son turu
    // ayrıca user_message olarak ekliyor, iki kez göndermek modeli tekrarlatıyor.
    const history = chatMsgs.slice(-8).map((m) => ({ role: m.role, text: m.content }))
    setChatMsgs((m) => [...m, { role: 'user', content: trimmed }])
    setChatInput('')
    setChatLoading(true)
    try {
      const dayMeals = meals.filter((m) => m.date === todayStr)
      const data = await callAiSuggest<{ message?: string; actions?: CoachAction[] }>({
        type: 'nutrition_chat',
        current_time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false }),
        user_message: trimmed,
        nutrition_context: {
          target: target
            ? { calories: target.calories, protein: target.protein, carbs: target.carbs, fat: target.fat, fiber: target.fiber }
            : undefined,
          consumed: {
            calories: dailySummary?.calories ?? 0,
            protein: dailySummary?.protein ?? 0,
            carbs: dailySummary?.carbs ?? 0,
            fat: dailySummary?.fat ?? 0,
            fiber: dailySummary?.fiber ?? 0,
          },
          meals_today: dayMeals.map((m) => ({ meal_type: m.meal_type, items: m.items })),
          history,
        },
      })

      const actions = (data.actions ?? [])
        .filter((a) => a.action === 'log_meal' && !!a.text)
        .map((a) => ({
          label: t.nut_coach_save_as_meal.replace('{meal}', (t['nutr_' + a.meal_type as keyof typeof t] as string) ?? t.nut_meal_fallback),
          icon: 'add-circle-outline' as const,
          doneLabel: t.nut_coach_saved,
          onPress: async () => {
            try {
              await logMealFromCoach(a.meal_type, a.text)
              await load(userId)
            } catch {
              Alert.alert(t.nut_err_save_coach_meal_title, t.nut_err_save_coach_meal_msg)
              throw new Error('log failed')
            }
          },
        }))

      setChatMsgs((m) => [...m, { role: 'assistant', content: data.message ?? t.nut_ai_no_response, actions }])
    } catch (error) {
      setChatMsgs((m) => [...m, { role: 'assistant', content: aiErrorMessage(error, t.nut_ai_err) }])
    } finally { setChatLoading(false) }
  }

  function handleChat() { void sendChat(chatInput) }

  const todayMeals = meals.filter((m) => m.date === todayStr)
  // Gün boşken tek cümleyle öğün yazmak AI sohbetinin en çok işe yaradığı an.
  const mealHint = useAiHint('nutrition', loaded && !nutritionError && todayMeals.length === 0)
  const totalCal   = dailySummary?.calories ?? todayMeals.reduce((s, m) => s + (m.total_calories ?? 0), 0)
  const totalProt  = dailySummary?.protein  ?? todayMeals.reduce((s, m) => s + (m.total_protein ?? 0), 0)
  const totalCarbs = dailySummary?.carbs    ?? todayMeals.reduce((s, m) => s + (m.total_carbs ?? 0), 0)
  const totalFat   = dailySummary?.fat      ?? todayMeals.reduce((s, m) => s + (m.total_fat ?? 0), 0)
  const totalFiber = dailySummary?.fiber    ?? todayMeals.reduce((s, m) => s + (m.total_fiber ?? 0), 0)

  /** Tarif kaydetme kutusundaki canlı porsiyon önizlemesi. */
  const recipePreview = (() => {
    const items = parsedItems ?? []
    const grams = items.reduce((sum, item) => sum + (item.grams ?? 0), 0)
    const kcal = items.reduce((sum, item) => sum + item.calories, 0)
    if (items.some((item) => !item.grams || item.grams <= 0)) {
      return t.nut_recipe_missing_grams
    }
    const portions = Math.max(0.5, parseFloat(recipePortions.replace(',', '.')) || 1)
    return t.nut_recipe_portion_calc.replace('{g}', String(Math.round(grams / portions))).replace('{kcal}', String(Math.round(kcal / portions)))
  })()

  return (
    <ScreenBackground>
      <ScreenHeader
        title={t.nutr_title}
        right={
          <>
            <TouchableOpacity onPress={() => { if (requirePro('nutrition_chat')) setShowChat(true) }} disabled={isCheckingPro} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.accent}18`, borderWidth: 1, borderColor: `${palette.accent}30`, alignItems: 'center', justifyContent: 'center', opacity: isPro ? 1 : 0.55 }}>
              <Ionicons name={isPro ? 'sparkles-outline' : 'lock-closed-outline'} size={18} color={palette.accent} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowAdd(true)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: palette.meal, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </>
        }
      />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: spacing[5], paddingBottom: bottomPadding }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={palette.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {mealHint.visible && (
          <AiHint text={t.ai_hint_nutrition} onClose={mealHint.close} onPress={() => { mealHint.use(); if (requirePro('nutrition_chat')) setShowChat(true) }} />
        )}

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
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[3] }}>{t.nutr_quick_search ?? t.nut_food_search_ph}</Text>
          <Input value={foodSearch} onChangeText={handleFoodSearch} placeholder={lang === 'tr' ? 'Yumurta, ekmek, peynir...' : 'Eggs, bread, cheese...'} />
          {foodResults.length > 0 && (
            <View style={{ marginTop: spacing[3], gap: 2 }}>
              {foodResults.map((food) => (
                <FoodChoiceRow key={`${food.source}-${food.id}`} food={food} onPress={() => openManualAdd(food)} />
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
                        {meal.total_calories} kcal · P:{meal.total_protein}g · {lang === 'tr' ? 'K' : 'C'}:{meal.total_carbs}g · {lang === 'tr' ? 'Y' : 'F'}:{meal.total_fat}g
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => confirmRemoveMeal(meal.id)} style={{ width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={lang === 'tr' ? 'Öğünü sil' : 'Delete meal'}>
                      <Ionicons name="trash-outline" size={16} color={colors.textSubtle} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openEditMeal(meal)} style={{ width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={lang === 'tr' ? 'Öğünü düzenle' : 'Edit meal'}>
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
          </View>
        )}
      </ScrollView>

      {/* Add meal */}
      <BottomSheet
        visible={showAdd}
        onClose={closeMealSheet}
        title={t.nut_add_meal_title}
        scrollable
      >
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

          {/* Ekleme yolu: serbest metin (çözümleme hattı) ya da listeden seçim.
              Listeden seçim model çağırmaz, bu yüzden ücretsiz planda da açıktır. */}
          <View style={{ flexDirection: 'row', gap: spacing[2], padding: 3, borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
            {([
              { key: 'text' as const, label: t.nutr_mode_text, icon: 'create-outline' as const },
              { key: 'search' as const, label: t.nutr_mode_search, icon: 'search-outline' as const },
              { key: 'manual' as const, label: t.ux_nutr_mode_manual, icon: 'calculator-outline' as const },
            ]).map(({ key, label, icon }) => (
              <TouchableOpacity
                key={key}
                onPress={() => setAddMode(key)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: radius.md, backgroundColor: addMode === key ? palette.accent : 'transparent' }}
              >
                <Ionicons name={icon} size={15} color={addMode === key ? '#fff' : colors.textMuted} />
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: addMode === key ? '#fff' : colors.textMuted }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {addMode === 'text' ? (
            <>
              <Input
                label={t.nutr_what_did_you_eat}
                value={rawInput}
                onChangeText={setRawInput}
                placeholder={t.nut_meal_text_ph}
                multiline
                numberOfLines={3}
                style={{ minHeight: 80, textAlignVertical: 'top' }}
                autoFocus
              />

              {/* Sonuç geldikten sonra da görünür kalır: çözümleme yanlışsa
                  kullanıcı metni düzeltip tekrar çalıştırabilmeli. Buton
                  gizlendiğinde tek çıkış yolu modalı kapatmaktı. */}
              <Button
                label={parsing ? t.nutr_analyzing : parsedItems ? t.nut_recalc : t.nut_calc}
                onPress={handleParse}
                loading={parsing}
                variant="secondary"
                fullWidth
              />
            </>
          ) : addMode === 'manual' ? (
            <ManualMacroForm onAdd={handleAddManual} />
          ) : (
            <View style={{ gap: spacing[3] }}>
              <Input
                label={t.nutr_search_food}
                value={foodSearch}
                onChangeText={handleFoodSearch}
                placeholder={lang === 'tr' ? 'Yumurta, ekmek, peynir...' : 'Eggs, bread, cheese...'}
              />

              {pendingChoice ? (
                <FoodChoiceAmount
                  key={`${pendingChoice.source}-${pendingChoice.id}`}
                  choice={pendingChoice}
                  onAdd={handleAddChoice}
                  onClear={() => setPendingChoice(null)}
                />
              ) : foodResults.length > 0 ? (
                <View style={{ gap: 2 }}>
                  {foodResults.map((food) => (
                    <FoodChoiceRow
                      key={`${food.source}-${food.id}`}
                      food={food}
                      onPress={() => setPendingChoice(food)}
                    />
                  ))}
                </View>
              ) : (
                <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, textAlign: 'center', paddingVertical: spacing[2] }}>
                  {t.nutr_search_hint}
                </Text>
              )}
            </View>
          )}

          {parsedItems && (
            <View style={{ gap: spacing[2] }}>
              {aiDegraded && (
                <View style={{ padding: spacing[3], borderRadius: radius.lg, backgroundColor: 'rgba(245,158,11,0.12)' }}>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 18 }}>
                    {aiDegraded === 'budget'
                      ? t.nut_ai_budget
                      : t.nut_ai_down}
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{parsedItems.length} {t.nutr_nutrients_found}</Text>
              {parsedItems.map((item, i) => (
                <View key={`${item.name}-${i}`} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>{item.name}</Text>
                  {/* Gramaj kaydetmeden önce düzeltilebilmeli: hattın 200 g
                      dediği levreği kaydedip sonra düzenlemeye girmek, yanlış
                      sayıyı önce onaylatıp sonra geri almak demek. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                    <AmountField
                      value={item.amount}
                      unit={item.unit}
                      onCommit={(amount) => updateParsedItemAmount(i, amount)}
                    />
                    <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{item.calories} kcal</Text>
                  </View>
                  {item.calories_min !== undefined && item.calories_max !== undefined && (
                    <Text style={{ marginTop: 3, fontSize: fontSize.xs, color: colors.textSubtle }}>
                      {item.calories_min}-{item.calories_max} kcal · {item.source === 'corpus' ? (item.source_label ? t.ux_nut_usda_label.replace('{label}', item.source_label) : t.ux_nut_usda_check) : portionRungLabel(t, item.portion_rung)}
                    </Text>
                  )}
                  {item.disposition === 'confirm' && !itemApprovals[i] && (
                    <TouchableOpacity
                      onPress={() => setItemApprovals((approvals) => approvals.map((approved, index) => index === i ? true : approved))}
                      style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: 8, backgroundColor: palette.accent }}
                    >
                      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: '#fff' }}>{t.nut_approve_match}</Text>
                    </TouchableOpacity>
                  )}
                  {item.disposition === 'confirm' && itemApprovals[i] && (
                    <Text style={{ marginTop: 4, fontSize: fontSize.xs, color: palette.success }}>{t.nut_approved}</Text>
                  )}

                  {feedbackSent[i] ? (
                    <Text style={{ marginTop: 6, fontSize: fontSize.xs, color: palette.success }}>
                      {t.nut_reported}
                    </Text>
                  ) : feedbackFor === i ? (
                    <View style={{ marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
                      {([
                        { kind: 'missing_item', label: t.nut_feedback_1 },
                        { kind: 'wrong_food', label: t.nut_feedback_2 },
                        { kind: 'wrong_portion', label: t.nut_feedback_3 },
                        { kind: 'wrong_macros', label: t.nut_feedback_4 },
                      ] as { kind: NutritionFeedbackKind; label: string }[]).map(({ kind, label }) => (
                        <TouchableOpacity
                          key={kind}
                          onPress={() => void sendItemFeedback(i, item, kind)}
                          style={{ paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(99,102,241,0.10)', borderWidth: 1, borderColor: colors.border }}
                        >
                          <Text style={{ fontSize: fontSize.xs, color: palette.accent, fontWeight: fontWeight.medium }}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity onPress={() => setFeedbackFor(null)} style={{ paddingHorizontal: spacing[2], paddingVertical: 6 }}>
                        <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{t.nut_give_up}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => setFeedbackFor(i)} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                      <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{t.nut_wrong_item_q}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {parsedQuestions.length > 0 && (
                <View style={{ gap: spacing[2], marginTop: spacing[2] }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                    {t.nut_unsure_items.replace('{n}', String(parsedQuestions.length))}
                  </Text>
                  {parsedQuestions.map((question, questionIndex) => {
                    const key = questionKey(question)
                    return (
                      <View key={key} style={{ padding: spacing[3], borderRadius: radius.lg, backgroundColor: 'rgba(99,102,241,0.08)', borderWidth: 1, borderColor: colors.border, gap: spacing[2] }}>
                        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
                          {question.kind === 'amount'
                            ? t.nut_how_many_grams.replace('{raw}', question.raw).replace('{food}', String(question.food_label ?? question.phrase))
                            : t.nut_which_one.replace('{raw}', question.raw)}
                        </Text>

                        {question.kind === 'choice' && question.choices.map((choice) => (
                          <TouchableOpacity
                            key={`${choice.source}:${choice.id}`}
                            onPress={() => void handleQuestionChoice(questionIndex, question, choice)}
                            style={{ paddingHorizontal: spacing[3], paddingVertical: 8, borderRadius: 9, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.border }}
                          >
                            <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                              {choice.label} · {choice.kcal_per_100g} kcal/100g
                            </Text>
                          </TouchableOpacity>
                        ))}

                        {question.kind === 'choice' && question.choices.length === 0 && (
                          <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{t.nut_food_not_in_db}</Text>
                        )}

                        {question.kind === 'amount' && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                            <Input
                              value={amountDrafts[key] ?? ''}
                              onChangeText={(value) => setAmountDrafts((drafts) => ({ ...drafts, [key]: value }))}
                              placeholder="gram"
                              keyboardType="decimal-pad"
                              containerStyle={{ flex: 1 }}
                            />
                            <TouchableOpacity
                              onPress={() => void handleQuestionAmount(questionIndex, question)}
                              style={{ paddingHorizontal: spacing[4], paddingVertical: 11, borderRadius: 10, backgroundColor: palette.accent }}
                            >
                              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: '#fff' }}>{t.nut_add_btn}</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        <TouchableOpacity onPress={() => dismissQuestion(questionIndex, key)}>
                          <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>{t.nut_skip}</Text>
                        </TouchableOpacity>
                      </View>
                    )
                  })}
                </View>
              )}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing[2] }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.nutr_total}</Text>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: palette.warning }}>
                  {parsedItems.reduce((s, i) => s + i.calories, 0)} kcal
                </Text>
              </View>

              {/* Kendi yaptığın yemeği kişisel veritabanına yaz. Kalemler zaten
                  ekranda; eksik olan tek şey ada ve porsiyona bağlamak. */}
              {showSaveRecipe ? (
                <View style={{ gap: spacing[3], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                      {t.nut_save_as_own_food}
                    </Text>
                    <TouchableOpacity onPress={() => setShowSaveRecipe(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="close" size={16} color={colors.textSubtle} />
                    </TouchableOpacity>
                  </View>

                  <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, lineHeight: 17 }}>
                    Yukarıdaki kalemler tek bir yiyecek satırına dönüşür. Besin değeri bu
                    kalemlerin toplamıdır, tahmin değil.
                  </Text>

                  <Input
                    label={t.nut_recipe_name_label}
                    value={recipeName}
                    onChangeText={setRecipeName}
                    placeholder={t.nut_recipe_name_ph}
                  />
                  <Input
                    label={t.nut_recipe_portions_label}
                    value={recipePortions}
                    onChangeText={setRecipePortions}
                    keyboardType="decimal-pad"
                    placeholder={t.nut_recipe_portions_ph}
                  />

                  <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{recipePreview}</Text>

                  <Button
                    label={savingRecipe ? t.nut_saving_recipe : t.nut_save_recipe}
                    onPress={() => void handleSaveRecipe()}
                    loading={savingRecipe}
                    variant="secondary"
                    fullWidth
                  />
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowSaveRecipe(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing[2] }}
                >
                  <Ionicons name="bookmark-outline" size={14} color={palette.accent} />
                  <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.accent }}>
                    {t.nut_save_as_my_food_btn}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <Button
            label={adding ? t.nutr_saving : t.nutr_save}
            onPress={handleAddMeal}
            loading={adding}
            disabled={(parsedItems?.length ?? 0) === 0 || itemApprovals.some((approved) => !approved)}
            fullWidth
          />
        </View>
      </BottomSheet>

      {/* AI Chat */}
      <AiChatSheet
        visible={showChat}
        onClose={() => setShowChat(false)}
        title={t.nut_coach_title}
        accent={palette.accent}
        messages={chatMsgs}
        loading={chatLoading}
        input={chatInput}
        onChangeInput={setChatInput}
        onSend={handleChat}
        placeholder={t.nut_coach_ph}
        emptyHint={t.nut_coach_hint}
        suggestions={[t.nut_coach_suggest_1, t.nut_coach_suggest_2, t.nut_coach_suggest_3, t.nut_coach_suggest_4]}
        onSuggestionPress={(text) => { void sendChat(text) }}
      />

      {/* Edit meal */}
      <BottomSheet
        visible={!!editingMeal}
        onClose={() => {
          setEditingMeal(null)
          setEditItems([])
          setEditBase([])
          setEditApprovals([])
          setEditTrace(null)
          setEditVersion(null)
          setEditRawInput('')
        }}
        title={t.nut_edit_meal_title}
        scrollable
      >
        <View style={{ gap: spacing[4] }}>
          <Input
            label={t.nut_meal_text_label}
            value={editRawInput}
            onChangeText={setEditRawInput}
            placeholder={t.nut_meal_text_ph}
            multiline
            numberOfLines={3}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />

          <Button
            label={editLoading ? t.nut_recalc_loading : t.nut_recalc}
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
                  <AmountField
                    value={item.amount}
                    unit={item.unit}
                    onCommit={(amount) => updateEditItemAmount(index, amount)}
                  />
                  <Text style={{ fontSize: fontSize.sm, color: palette.warning }}>{Math.round(item.calories)} kcal</Text>
                </View>
                {item.calories_min !== undefined && item.calories_max !== undefined && (
                  <Text style={{ marginTop: 4, fontSize: fontSize.xs, color: colors.textSubtle }}>
                    {item.calories_min}-{item.calories_max} kcal {item.source === 'corpus' ? `· USDA${item.source_label ? ': ' + item.source_label : ''}` : ''}
                  </Text>
                )}
                {item.disposition === 'confirm' && !editApprovals[index] && (
                  <TouchableOpacity
                    onPress={() => setEditApprovals((approvals) => approvals.map((approved, approvalIndex) => approvalIndex === index ? true : approved))}
                    style={{ alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: 8, backgroundColor: palette.accent }}
                  >
                    <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: '#fff' }}>{t.nut_approve_match}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          <Button
            label={editLoading ? t.nut_save_changes_loading : t.nut_save_changes}
            onPress={() => void handleSaveMealEdit()}
            loading={editLoading}
            disabled={editItems.length === 0 || editApprovals.some((approved) => !approved)}
            fullWidth
          />
        </View>
      </BottomSheet>
    </ScreenBackground>
  )
}

/**
 * Gramaj alanı.
 *
 * Kontrollü bir TextInput'a doğrudan sayı bağlamak, alanı SİLİNEMEZ yapar:
 * kullanıcı "200"ü silmek için son karakteri sildiğinde metin "" olur,
 * Number("") = 0 geçersiz sayılır, state güncellenmez ve alan eski değere
 * geri sıçrar. Sonuç, ölçülen şikâyetin ta kendisi: "gramajı girip
 * değiştiremiyorum" — mevcut sayının başına ya da sonuna rakam eklemekten
 * başka bir şey yapılamıyordu.
 *
 * Çözüm, metin taslağını sayıdan AYIRMAK. Alan her tuşta yazılanı olduğu gibi
 * tutar; yalnızca geçerli bir sayı çıktığında dışarı haber verilir. Boş alan,
 * yarım ondalık ("7.") ve virgüllü giriş ("7,5") artık ara durum olarak
 * yaşayabiliyor.
 */
function AmountField({
  value,
  unit,
  onCommit,
  disabled,
}: {
  value: number
  unit: string
  onCommit: (amount: number) => void
  disabled?: boolean
}) {
  const { colors } = useTheme()
  const [draft, setDraft] = useState(String(value))

  // Dışarıdan gelen değişiklik (yeniden hesapla, öğün değişti) taslağı tazeler.
  // Kullanıcının kendi yazdığı değer commit sonrası aynı sayıya döndüğü için
  // bu efekt onun yazdığını ezmiyor.
  useEffect(() => { setDraft(String(value)) }, [value])

  function handleChange(text: string) {
    setDraft(text)
    const parsed = parseFloat(text.replace(',', '.'))
    if (Number.isFinite(parsed) && parsed > 0) onCommit(parsed)
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Input
        value={draft}
        onChangeText={handleChange}
        onBlur={() => { if (!draft.trim()) setDraft(String(value)) }}
        keyboardType="decimal-pad"
        selectTextOnFocus
        editable={disabled !== true}
        containerStyle={{ width: 84 }}
        style={{ textAlign: 'right', paddingVertical: 6 }}
      />
      <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{unit}</Text>
    </View>
  )
}

/**
 * Arama sonucundaki tek satır. Küratörsüz (USDA) satırlar rozetle ayrılır ki
 * kullanıcı değerin nereden geldiğini görsün.
 */
function FoodChoiceRow({ food, onPress }: { food: FoodSearchResult; onPress: () => void }) {
  const { colors } = useTheme()
  const isCorpus = food.source === 'corpus'

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2], paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.base, color: colors.textSecondary }} numberOfLines={2}>{food.label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: 2 }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
            {food.kcal_per_100g} kcal / 100 g
          </Text>
          {isCorpus && (
            <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.full, backgroundColor: `${palette.warning}1F` }}>
              <Text style={{ fontSize: 10, fontWeight: fontWeight.bold, color: palette.warning }}>USDA</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="add-circle-outline" size={22} color={palette.meal} />
    </TouchableOpacity>
  )
}
