'use client'

import { useState, useCallback, useEffect } from 'react'
import type {
  MealType,
  CreateMealInput,
  MealItem,
  Meal,
  MealQuestion,
  ParseMealResponse,
  ParseTraceEntry,
  QuestionChoice,
  FoodSearchResult,
} from '@lifeos/shared'
import {
  MEAL_TYPE_LABELS,
  MEAL_TYPE_ICONS,
  PORTION_RUNG_LABELS,
  RESOLVE_RUNG_LABELS,
} from '@lifeos/shared'
import {
  buildItemFromChoice,
  saveFoodAlias,
  savePortionMemory,
  searchFoodChoices,
} from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

interface MacroRate {
  calories: number; protein: number; carbs: number; fat: number; fiber: number
}

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

/**
 * Gramaj elle değiştirildiğinde besin değeri yeniden ORANLANIR — yeni bir tahmin
 * üretilmez. Elle girilen miktar tartılmış değil beyan edilmiştir, o yüzden bant
 * ±%5'e daralır ve basamak "senin porsiyonun" olur.
 */
const USER_SET_TOLERANCE = 0.05

function rescaleToGrams(item: MealItem, grams: number): MealItem {
  const current = item.grams && item.grams > 0 ? item.grams : item.amount || 1
  const factor = grams / current
  const calories = Math.round(item.calories * factor)
  return {
    ...item,
    amount: Math.round(grams),
    unit: item.unit === 'ml' ? 'ml' : 'g',
    grams: Math.round(grams * 10) / 10,
    calories,
    protein: Math.round(item.protein * factor * 10) / 10,
    carbs: Math.round(item.carbs * factor * 10) / 10,
    fat: Math.round(item.fat * factor * 10) / 10,
    fiber: Math.round(item.fiber * factor * 10) / 10,
    calories_min: Math.round(calories * (1 - USER_SET_TOLERANCE)),
    calories_max: Math.round(calories * (1 + USER_SET_TOLERANCE)),
    portion_rung: 'user_memory',
    portion_tolerance: USER_SET_TOLERANCE,
  }
}

function totalRange(items: MealItem[]): { min: number; max: number; hasRange: boolean } {
  let min = 0
  let max = 0
  let hasRange = false
  for (const item of items) {
    const lo = item.calories_min ?? item.calories
    const hi = item.calories_max ?? item.calories
    if (item.calories_min !== undefined && item.calories_max !== undefined) hasRange = true
    min += lo
    max += hi
  }
  return { min: Math.round(min), max: Math.round(max), hasRange }
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

interface MealAddModalProps {
  open: boolean
  onClose: () => void
  userId: string
  onSubmit: (input: CreateMealInput) => Promise<void>
  onParseMeal?: (rawInput: string) => Promise<ParseMealResponse>
  editMeal?: Meal | null
  onUpdate?: (mealId: string, updates: Partial<CreateMealInput>) => Promise<void>
}

export function MealAddModal({ open, onClose, userId, onSubmit, onParseMeal, editMeal, onUpdate }: MealAddModalProps) {
  const isEdit = !!editMeal
  const [mealType, setMealType]       = useState<MealType>('lunch')
  const [rawInput, setRawInput]       = useState('')
  const [parsedItems, setParsedItems] = useState<MealItem[]>([])
  const [itemApprovals, setItemApprovals] = useState<boolean[]>([])
  const [questions, setQuestions]     = useState<MealQuestion[]>([])
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({})
  const [trace, setTrace]             = useState<ParseTraceEntry[] | null>(null)
  const [parseVersion, setParseVersion] = useState<string | null>(null)
  const [aiDegraded, setAiDegraded]   = useState(false)
  const [rates, setRates]             = useState<MacroRate[]>([])
  const [parsing, setParsing]         = useState(false)
  const [saving, setSaving]           = useState(false)
  const [step, setStep]               = useState<'input' | 'review'>('input')
  // Elle ekleme yolu: model çağırmaz, bu yüzden ücretsiz planda da açıktır.
  const [addMode, setAddMode]         = useState<'text' | 'search'>('text')
  const [foodQuery, setFoodQuery]     = useState('')
  const [foodResults, setFoodResults] = useState<FoodSearchResult[]>([])
  const [pendingChoice, setPendingChoice] = useState<FoodSearchResult | null>(null)
  const [pendingGrams, setPendingGrams]   = useState('')
  const [addingChoice, setAddingChoice]   = useState(false)
  const { showToast } = useToast()

  const initRates = useCallback((items: MealItem[]) => setRates(items.map(calcRate)), [])

  useEffect(() => {
    if (editMeal) {
      setMealType(editMeal.meal_type)
      setRawInput(editMeal.raw_input ?? '')
      setParsedItems(editMeal.items)
      setItemApprovals(editMeal.items.map((item) => item.disposition !== 'confirm'))
      initRates(editMeal.items)
      setStep('review')
    } else {
      setMealType('lunch'); setRawInput(''); setParsedItems([]); setItemApprovals([]); setRates([]); setStep('input')
    }
    setQuestions([]); setAmountDrafts({}); setTrace(null); setParseVersion(null); setAiDegraded(false)
    setAddMode('text'); setFoodQuery(''); setFoodResults([]); setPendingChoice(null); setPendingGrams('')
  }, [editMeal, open, initRates])

  const handleParse = useCallback(async () => {
    if (!rawInput.trim() || !onParseMeal) return
    setParsing(true)
    try {
      const response = await onParseMeal(rawInput)
      const items = response.items ?? []
      setParsedItems(items)
      setItemApprovals(items.map((item) => item.disposition !== 'confirm'))
      initRates(items)
      setQuestions(response.questions ?? [])
      setTrace(response.trace ?? null)
      setParseVersion(response.version ?? null)
      setAiDegraded(response.ai?.pro === true && response.ai.enabled === false)
      setStep('review')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Öğün parse edilemedi.', 'error')
    } finally { setParsing(false) }
  }, [rawInput, onParseMeal, showToast, initRates])

  const handleSave = useCallback(async () => {
    if (itemApprovals.some((approved) => !approved)) {
      showToast('Küratörsüz kaynaklardan gelen kalemleri kaydetmeden önce onayla.', 'error')
      return
    }
    setSaving(true)
    try {
      // Elle ayarlanan gramajlar bu kullanıcının alışkanlığı olarak hatırlanır —
      // aynı ifade bir daha ne modele sorulur ne kullanıcıya.
      await Promise.all(
        parsedItems
          .filter((item) => item.phrase && item.portion_rung === 'user_memory' && item.grams)
          .map((item) => savePortionMemory(supabase, userId, item.phrase!, item.grams!).catch(() => undefined)),
      )

      if (isEdit && editMeal && onUpdate) {
        await onUpdate(editMeal.id, {
          meal_type: mealType,
          items: parsedItems,
          ...(trace ? { parse_trace: trace } : {}),
          ...(parseVersion ? { parse_version: parseVersion } : {}),
        })
      } else {
        await onSubmit({
          meal_type: mealType,
          // Listeden seçim akışında serbest metin girilmez; kalem adları özet olur.
          raw_input: rawInput.trim() || parsedItems.map((item) => item.name).join(', '),
          items: parsedItems,
          ...(trace ? { parse_trace: trace } : {}),
          ...(parseVersion ? { parse_version: parseVersion } : {}),
        })
      }
      onClose()
    } finally { setSaving(false) }
  }, [isEdit, editMeal, mealType, rawInput, parsedItems, itemApprovals, trace, parseVersion, userId, onSubmit, onUpdate, onClose, showToast])

  const handleAmountChange = useCallback((index: number, newAmount: number) => {
    if (!newAmount) return
    setParsedItems((items) => items.map((item, i) => {
      if (i !== index) return item
      // Hattan gelen kalemlerde miktar = gram; elle eklenen satırlarda eski oran mantığı
      if (item.grams !== undefined) return rescaleToGrams(item, newAmount)
      const rate = rates[index]
      return rate ? { ...item, ...applyRate(rate, newAmount) } : item
    }))
  }, [rates])

  const handleNameChange = useCallback((index: number, name: string) => {
    setParsedItems((items) => items.map((item, i) => i === index ? { ...item, name } : item))
  }, [])

  const handleRemoveItem = useCallback((index: number) => {
    setParsedItems((items) => items.filter((_, i) => i !== index))
    setItemApprovals((approvals) => approvals.filter((_, i) => i !== index))
    setRates((r) => r.filter((_, i) => i !== index))
  }, [])

  // Arama kutusu: yazmayı bırakınca sorgular, model çağrısı yok.
  useEffect(() => {
    if (addMode !== 'search' || foodQuery.trim().length < 2) { setFoodResults([]); return }
    let active = true
    const timer = setTimeout(() => {
      searchFoodChoices(supabase, foodQuery, userId, 12)
        .then((results) => { if (active) setFoodResults(results) })
        .catch(() => { if (active) setFoodResults([]) })
    }, 300)
    return () => { active = false; clearTimeout(timer) }
  }, [foodQuery, addMode, userId])

  /**
   * Aramadan seçilen satırı listeye ekler. Besin değeri yine veritabanı satırından
   * hesaplanır; kullanıcı satırı bizzat seçtiği için ayrıca onay istenmez.
   */
  const handleAddChoice = useCallback(async () => {
    if (!pendingChoice) return
    const typed = Number(pendingGrams)
    const grams = Number.isFinite(typed) && typed > 0 ? typed : pendingChoice.default_grams
    setAddingChoice(true)
    try {
      const item = await buildItemFromChoice(supabase, pendingChoice, grams)
      setParsedItems((items) => [...items, item])
      setItemApprovals((approvals) => [...approvals, true])
      setRates((r) => [...r, calcRate(item)])
      // Seçim ve gramaj hatırlanır; serbest metin hattı bir dahaki sefere bulur.
      await saveFoodAlias(supabase, userId, pendingChoice.label,
        pendingChoice.source === 'curated'
          ? { food_item_id: pendingChoice.id }
          : { corpus_fdc_id: pendingChoice.id }).catch(() => undefined)
      await savePortionMemory(supabase, userId, pendingChoice.label, grams).catch(() => undefined)
      setPendingChoice(null)
      setPendingGrams('')
      // 'review'e atlamıyoruz: kullanıcı arka arkaya birkaç kalem ekleyebilsin.
      setFoodQuery('')
      setFoodResults([])
    } catch {
      showToast('Yiyecek eklenemedi.', 'error')
    } finally { setAddingChoice(false) }
  }, [pendingChoice, pendingGrams, userId, showToast])

  const handleAddItem = useCallback(() => {
    const blank: MealItem = { name: '', amount: 100, unit: 'g', calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    setParsedItems((items) => [...items, blank])
    setItemApprovals((approvals) => [...approvals, true])
    setRates((r) => [...r, calcRate(blank)])
  }, [])

  const dismissQuestion = useCallback((index: number, key: string) => {
    setQuestions((qs) => qs.filter((_, i) => i !== index))
    setAmountDrafts((drafts) => {
      const next = { ...drafts }
      delete next[key]
      return next
    })
  }, [])

  /** Kapalı listeden seçim: satır belli olur, besin değeri yine DB'den hesaplanır. */
  const handleChoice = useCallback(async (index: number, question: MealQuestion, choice: QuestionChoice) => {
    const questionKey = `${question.kind}:${question.phrase}:${question.raw}`
    try {
      const item = await buildItemFromChoice(supabase, choice)
      await saveFoodAlias(
        supabase,
        userId,
        question.phrase,
        choice.source === 'curated' ? { food_item_id: choice.id } : { corpus_fdc_id: choice.id },
      )
      setParsedItems((items) => [...items, { ...item, phrase: question.phrase }])
      setItemApprovals((approvals) => [...approvals, true])
      setRates((r) => [...r, calcRate(item)])
      setTrace((entries) => resolveTraceQuestion(entries, question, item))
      dismissQuestion(index, questionKey)
    } catch {
      showToast('Seçim uygulanamadı.', 'error')
    }
  }, [userId, dismissQuestion, showToast])

  /** Gramaj sorusu: kimlik zaten belli, eksik olan miktardı. */
  const handleAmountAnswer = useCallback(async (index: number, question: MealQuestion) => {
    const questionKey = `${question.kind}:${question.phrase}:${question.raw}`
    const grams = parseFloat((amountDrafts[questionKey] ?? '').replace(',', '.'))
    if (!Number.isFinite(grams) || grams <= 0) return
    const id = question.food_item_id ?? question.corpus_fdc_id
    if (!id) return

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
      setParsedItems((items) => [...items, resolvedItem])
      setItemApprovals((approvals) => [...approvals, resolvedItem.disposition !== 'confirm'])
      setRates((r) => [...r, calcRate(resolvedItem)])
      setTrace((entries) => resolveTraceQuestion(entries, question, resolvedItem))
      dismissQuestion(index, questionKey)
    } catch {
      showToast('Miktar uygulanamadı.', 'error')
    }
  }, [amountDrafts, userId, dismissQuestion, showToast])

  const totalCalories = parsedItems.reduce((s, i) => s + (i.calories || 0), 0)
  const totalProtein  = parsedItems.reduce((s, i) => s + (i.protein  || 0), 0)
  const totalCarbs    = parsedItems.reduce((s, i) => s + (i.carbs    || 0), 0)
  const totalFat      = parsedItems.reduce((s, i) => s + (i.fat      || 0), 0)
  const range = totalRange(parsedItems)

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Öğünü Düzenle' : 'Öğün Ekle'} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(MEAL_TYPE_LABELS) as MealType[]).map((type) => (
            <button key={type} onClick={() => setMealType(type)}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all ${mealType === type ? 'bg-accent text-white shadow-sm' : 'bg-gray-100 text-muted hover:bg-gray-200'}`}>
              <span>{MEAL_TYPE_ICONS[type]}</span>{MEAL_TYPE_LABELS[type]}
            </button>
          ))}
        </div>

        {step === 'input' && (
          <>
            {/* Ekleme yolu: serbest metin (çözümleme hattı) ya da listeden seçim.
                Listeden seçim model çağırmaz, ücretsiz planda da çalışır. */}
            {!isEdit && (
              <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
                {([
                  { key: 'text' as const, label: 'Yazarak' },
                  { key: 'search' as const, label: 'Listeden seç' },
                ]).map(({ key, label }) => (
                  <button key={key} onClick={() => setAddMode(key)}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                      addMode === key ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-primary'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {isEdit || addMode === 'text' ? (
              <>
                <Textarea
                  label={isEdit ? 'Öğünü yeniden parse et' : 'Ne yedin?'}
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  rows={4}
                  placeholder="Örn: 2 yumurta 2 dilim tam buğday ekmeği beyaz peynir çay"
                />
                <div className="flex justify-between gap-2">
                  {isEdit
                    ? <Button variant="ghost" size="sm" onClick={() => setStep('review')}>← İptal, Geri Dön</Button>
                    : <Button variant="ghost" size="sm" onClick={onClose}>İptal</Button>
                  }
                  {onParseMeal
                    ? <Button size="sm" onClick={() => void handleParse()} loading={parsing} disabled={!rawInput.trim()}>Hesapla</Button>
                    : <Button size="sm" onClick={() => void handleSave()} loading={saving} disabled={!rawInput.trim()}>Kaydet</Button>
                  }
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <input
                  value={foodQuery}
                  onChange={(e) => setFoodQuery(e.target.value)}
                  placeholder="Yumurta, ekmek, peynir..."
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-primary outline-none focus:border-accent"
                />

                {pendingChoice ? (
                  <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-primary">{pendingChoice.label}</p>
                      <button onClick={() => { setPendingChoice(null); setPendingGrams('') }}
                        className="shrink-0 rounded-lg p-1 text-muted hover:bg-gray-200">✕</button>
                    </div>
                    <p className="text-[11px] text-muted">
                      {pendingChoice.kcal_per_100g} kcal / 100 g
                      {pendingChoice.source === 'corpus' ? ' · USDA' : ''}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={pendingGrams}
                        onChange={(e) => setPendingGrams(e.target.value)}
                        placeholder={String(pendingChoice.default_grams)}
                        className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-sm text-primary outline-none focus:border-accent"
                      />
                      <span className="text-xs text-muted">gram</span>
                      <Button size="sm" onClick={() => void handleAddChoice()} loading={addingChoice}>
                        Öğüne ekle
                      </Button>
                    </div>
                  </div>
                ) : foodResults.length > 0 ? (
                  <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                    {foodResults.map((food) => (
                      <button
                        key={`${food.source}-${food.id}`}
                        onClick={() => { setPendingChoice(food); setPendingGrams(String(food.default_grams)) }}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2 text-left transition hover:border-accent hover:bg-white"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-primary">{food.label}</span>
                          <span className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-[10px] text-muted">{food.kcal_per_100g} kcal / 100 g</span>
                            {food.source === 'corpus' && (
                              <span className="rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-bold text-amber-700">USDA</span>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 text-accent">+</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="py-2 text-center text-[11px] text-muted">
                    Aramak için en az iki harf yaz.
                  </p>
                )}

                <div className="flex justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={onClose}>İptal</Button>
                  {parsedItems.length > 0 && (
                    <Button size="sm" onClick={() => setStep('review')}>
                      Devam ({parsedItems.length})
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {step === 'review' && (
          <>
            {aiDegraded && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                AI katmanı şu anda kullanılamıyor. Öğün, sözlük ve kural katmanıyla hesaplandı —
                emin olunamayan kalemler aşağıda soru olarak duruyor.
              </p>
            )}

            {/* Yiyecek listesi — düzenlenebilir */}
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {parsedItems.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={item.name}
                      onChange={(e) => handleNameChange(idx, e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-primary outline-none hover:border-gray-200 focus:border-accent focus:bg-white"
                    />
                    <input
                      type="number"
                      value={item.amount}
                      onChange={(e) => handleAmountChange(idx, parseFloat(e.target.value) || 0)}
                      className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-xs text-primary outline-none focus:border-accent"
                      min={0}
                    />
                    <span className="shrink-0 text-[10px] text-muted">{item.unit}</span>
                    <span className="shrink-0 w-14 text-right text-xs font-semibold text-accent">{item.calories} kcal</span>
                    <button
                      onClick={() => handleRemoveItem(idx)}
                      className="shrink-0 rounded-lg p-1 text-muted hover:bg-danger/10 hover:text-danger"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Bu sayı nereden geldi: aralık + hangi basamak cevapladı */}
                  {item.calories_min !== undefined && item.calories_max !== undefined && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-1 text-[10px] text-muted">
                      <span className="font-medium">{item.calories_min}–{item.calories_max} kcal</span>
                      {item.resolve_rung && (
                        <span className="rounded bg-gray-200/70 px-1.5 py-0.5">{RESOLVE_RUNG_LABELS[item.resolve_rung]}</span>
                      )}
                      {item.portion_rung && (
                        <span className="rounded bg-gray-200/70 px-1.5 py-0.5">
                          {PORTION_RUNG_LABELS[item.portion_rung]}
                          {item.portion_tolerance ? ` ±%${Math.round(item.portion_tolerance * 100)}` : ''}
                        </span>
                      )}
                      {item.source === 'corpus' && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">USDA — kontrol et</span>
                      )}
                      {item.disposition === 'confirm' && !itemApprovals[idx] && (
                        <button
                          onClick={() => setItemApprovals((approvals) => approvals.map((approved, i) => i === idx ? true : approved))}
                          className="rounded bg-amber-600 px-2 py-0.5 font-semibold text-white hover:bg-amber-700"
                        >
                          Bu eşleşmeyi onayla
                        </button>
                      )}
                      {item.disposition === 'confirm' && itemApprovals[idx] && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">onaylandı</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Çözülemeyenler: uydurma yerine soru */}
            {questions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted">
                  Emin olamadıklarım ({questions.length}) — tahmin yürütmedim
                </p>
                {questions.map((question, qIdx) => (
                  <div
                    key={`${question.kind}:${question.phrase}:${question.raw}`}
                    className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-primary">
                        {question.kind === 'amount'
                          ? `«${question.raw}» — ${question.food_label} kaç gram?`
                          : `«${question.raw}» — bu hangisi?`}
                      </p>
                      <button
                        onClick={() => dismissQuestion(qIdx, `${question.kind}:${question.phrase}:${question.raw}`)}
                        className="shrink-0 rounded-lg px-1.5 text-[10px] text-muted hover:text-danger"
                      >
                        atla
                      </button>
                    </div>

                    {question.kind === 'choice' && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {question.choices.map((choice) => (
                          <button
                            key={`${choice.source}:${choice.id}`}
                            onClick={() => void handleChoice(qIdx, question, choice)}
                            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-primary hover:border-accent hover:text-accent"
                          >
                            {choice.label}
                            <span className="ml-1 text-muted">{choice.kcal_per_100g} kcal/100g</span>
                          </button>
                        ))}
                        {question.choices.length === 0 && (
                          <span className="text-[11px] text-muted">
                            Bu yiyecek veritabanında yok. Elle ekleyebilirsin.
                          </span>
                        )}
                      </div>
                    )}

                    {question.kind === 'amount' && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <input
                          type="number"
                          value={amountDrafts[`${question.kind}:${question.phrase}:${question.raw}`] ?? ''}
                          onChange={(e) => setAmountDrafts((drafts) => ({
                            ...drafts,
                            [`${question.kind}:${question.phrase}:${question.raw}`]: e.target.value,
                          }))}
                          placeholder="gram"
                          className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-accent"
                          min={0}
                        />
                        <Button size="sm" variant="ghost" onClick={() => void handleAmountAnswer(qIdx, question)}>
                          Ekle
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleAddItem}
              className="w-full rounded-xl border border-dashed border-gray-200 py-2 text-xs font-medium text-muted hover:border-accent hover:text-accent"
            >
              + Yiyecek Ekle
            </button>

            {/* Toplam */}
            <div className="rounded-xl bg-accent/5 px-4 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-primary">{totalCalories} kcal</span>
                <div className="flex gap-3 text-[11px]">
                  <span className="font-semibold text-blue-500">P {Math.round(totalProtein)}g</span>
                  <span className="font-semibold text-amber-500">K {Math.round(totalCarbs)}g</span>
                  <span className="font-semibold text-red-500">Y {Math.round(totalFat)}g</span>
                  <span className="font-semibold text-green-500">L {Math.round(parsedItems.reduce((s,i) => s + i.fiber, 0))}g</span>
                </div>
              </div>
              {range.hasRange && range.max > range.min && (
                <p className="mt-0.5 text-[10px] text-muted">
                  aralık {range.min}–{range.max} kcal · gramajı düzeltirsen daralır
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep('input')}>
                {isEdit ? '↻ Yeniden Hesapla' : '← Geri'}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>İptal</Button>
                <Button
                  size="sm"
                  onClick={() => void handleSave()}
                  loading={saving}
                  disabled={parsedItems.length === 0 || itemApprovals.some((approved) => !approved)}
                >
                  ✓ {isEdit ? 'Güncelle' : 'Kaydet'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
