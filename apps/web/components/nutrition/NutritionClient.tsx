'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { CreateMealInput, MealType, Meal, ParseMealResponse } from '@lifeos/shared'
import {
  todayDate, relativeDateLabel, shiftIsoDate,
  useNutritionStore, useWorkoutStore,
  compareMacrosToTarget, APP_DEFAULTS,
  MEAL_TYPE_LABELS, MEAL_TYPE_ICONS, describeAiError } from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { MacroDashboard } from '@/components/nutrition/MacroProgress'
import { MealCard } from '@/components/nutrition/MealCard'
import { MealAddModal } from '@/components/nutrition/MealAddModal'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { useLang } from '@/lib/contexts/LangContext'
import { Button } from '@/components/ui/Button'

type FoodResult = { name: string; name_en?: string | null; calories: number; protein: number; carbs: number; fat: number; fiber: number; serving_size: number; serving_unit: string }

interface NutritionClientProps { userId: string }

interface ChatMsg { role: 'user' | 'assistant'; text: string }

function isParseMealResponse(value: unknown): value is ParseMealResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate['items'])
    && Array.isArray(candidate['questions'])
    && typeof candidate['version'] === 'string'
    && Array.isArray(candidate['trace'])
    && !!candidate['ai']
    && typeof candidate['ai'] === 'object'
}

export default function NutritionClient({ userId }: NutritionClientProps) {
  const { date, meals, target, dailySummary, loading, fetchDayNutrition, addMeal, editMeal, removeMeal } = useNutritionStore()
  const { todayWorkout, fetchTodayWorkout } = useWorkoutStore()
  const { isPro, loading: subLoading } = useSubscription()
  const { t, lang } = useLang()

  const [showAddMeal, setShowAddMeal]   = useState(false)
  const [editingMeal, setEditingMeal]   = useState<Meal | null>(null)
  const [foodSearch, setFoodSearch]     = useState('')
  const [foodResults, setFoodResults]   = useState<FoodResult[]>([])
  const [quickAdd, setQuickAdd]         = useState<{ food: FoodResult; qty: number; mealType: MealType } | null>(null)
  const [quickAdding, setQuickAdding]   = useState(false)

  // Nutrition AI Chat
  const [chatOpen, setChatOpen]         = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput]       = useState('')
  const [chatLoading, setChatLoading]   = useState(false)
  const chatEndRef                      = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading, chatOpen])

  const today = todayDate()
  const dateLabel = relativeDateLabel(date)
  const isToday = date === today

  useEffect(() => {
    void fetchDayNutrition(supabase, userId)
    void fetchTodayWorkout(supabase, userId, today)
  }, [fetchDayNutrition, fetchTodayWorkout, userId, today])

  const handleDateChange = useCallback((offset: number) => {
    void fetchDayNutrition(supabase, userId, shiftIsoDate(date, offset))
  }, [date, fetchDayNutrition, userId])

  const handleCreateMeal = useCallback(async (input: CreateMealInput) => {
    await addMeal(supabase, userId, { ...input, date })
  }, [addMeal, userId, date])

  const handleUpdateMeal = useCallback(async (mealId: string, updates: Partial<CreateMealInput>) => {
    await editMeal(supabase, mealId, updates)
    setEditingMeal(null)
  }, [editMeal])

  const handleParseMeal = useCallback(async (rawInput: string): Promise<ParseMealResponse> => {
    let { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      const { data: refreshData } = await supabase.auth.refreshSession()
      session = refreshData.session
    }
    if (!session?.access_token) throw new Error('Oturum bulunamadı. Lütfen tekrar giriş yapın.')
    const response = await fetch(`${process.env['NEXT_PUBLIC_SUPABASE_URL']}/functions/v1/parse-meal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ raw_input: rawInput, user_id: userId }),
    })
    if (!response.ok) throw new Error('Öğün ayrıştırma başarısız oldu')
    const data: unknown = await response.json()
    if (!isParseMealResponse(data)) {
      throw new Error('Öğün ayrıştırma yanıtı beklenen biçimde değil.')
    }
    return data
  }, [userId])

  const handleDeleteMeal = useCallback(async (mealId: string) => {
    if (window.confirm('Bu öğünü silmek istediğine emin misin?')) {
      await removeMeal(supabase, mealId)
    }
  }, [removeMeal])

  const handleSendChat = useCallback(async () => {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    setChatInput('')
    setChatMessages((p) => [...p, { role: 'user', text: msg }])
    setChatLoading(true)
    try {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) { const { data: r } = await supabase.auth.refreshSession(); session = r.session }
      if (!session) throw new Error('Oturum yok')

      const consumed = {
        calories: dailySummary?.calories ?? 0, protein: dailySummary?.protein ?? 0,
        carbs: dailySummary?.carbs ?? 0, fat: dailySummary?.fat ?? 0, fiber: dailySummary?.fiber ?? 0,
      }
      const tgt = {
        calories: target?.calories ?? 2000, protein: target?.protein ?? 150,
        carbs: target?.carbs ?? 250, fat: target?.fat ?? 70, fiber: target?.fiber ?? 25,
      }
      const meals_today = meals.map((m) => ({
        meal_type: m.meal_type,
        items: m.items.map((i) => ({ name: i.name, amount: i.amount, unit: i.unit, calories: i.calories })),
      }))

      const { data, error } = await supabase.functions.invoke('ai-suggest', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          type: 'nutrition_chat',
          language: lang,
          user_message: msg,
          nutrition_context: {
            target: tgt,
            consumed,
            meals_today,
            history: chatMessages.slice(-8),
          },
        },
      })
      if (error) throw error
      const reply = (data as { message: string }).message
      setChatMessages((p) => [...p, { role: 'assistant', text: reply }])
    } catch (err) {
      const info = await describeAiError(err, lang)
      if (info.detail) console.error('ai-suggest nutrition:', info.status, info.detail)
      setChatMessages((p) => [...p, { role: 'assistant', text: info.message }])
    } finally {
      setChatLoading(false)
    }
  }, [chatInput, chatLoading, chatMessages, dailySummary, target, meals, lang])

  const handleFoodSearch = useCallback(async (query: string) => {
    setFoodSearch(query)
    if (!query.trim() || query.length < 2) { setFoodResults([]); return }
    const q = query.toLowerCase().trim()
    const userFilter = `user_id.is.null,user_id.eq.${userId}`
    const cols = 'name, name_en, calories, protein, carbs, fat, fiber, serving_size, serving_unit'

    const [{ data: byName }, { data: byAlias }, { data: byNameEn }] = await Promise.all([
      supabase.from('food_items').select(cols).or(userFilter)
        .ilike('name', `%${q}%`).order('is_verified', { ascending: false }).limit(12),
      supabase.from('food_items').select(cols).or(userFilter)
        .contains('aliases', [q]).order('is_verified', { ascending: false }).limit(8),
      supabase.from('food_items').select(cols).or(userFilter)
        .ilike('name_en', `%${q}%`).order('is_verified', { ascending: false }).limit(12),
    ])

    const seen = new Set<string>()
    const merged: FoodResult[] = []
    for (const item of [...(byName ?? []), ...(byAlias ?? []), ...(byNameEn ?? [])]) {
      const key = (item as FoodResult).name.toLowerCase()
      if (!seen.has(key)) { seen.add(key); merged.push(item as FoodResult) }
    }
    setFoodResults(merged.slice(0, 8))
  }, [userId])

  const handleQuickAdd = useCallback(async () => {
    if (!quickAdd) return
    setQuickAdding(true)
    const ratio = quickAdd.qty / quickAdd.food.serving_size
    try {
      await addMeal(supabase, userId, {
        meal_type: quickAdd.mealType,
        raw_input: `${quickAdd.qty}${quickAdd.food.serving_unit} ${quickAdd.food.name}`,
        date,
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
    } finally { setQuickAdding(false) }
  }, [quickAdd, addMeal, userId, date])

  const macroProgress = dailySummary && target
    ? compareMacrosToTarget(
        { calories: dailySummary.calories, protein: dailySummary.protein, carbs: dailySummary.carbs, fat: dailySummary.fat, fiber: dailySummary.fiber },
        { ...target, calories: target.calories, protein: target.protein, carbs: target.carbs, fat: target.fat, fiber: target.fiber },
      )
    : null

  const defaultProgress = {
    calories: { current: dailySummary?.calories ?? 0, target: APP_DEFAULTS.DEFAULT_CALORIES, percentage: Math.round(((dailySummary?.calories ?? 0) / APP_DEFAULTS.DEFAULT_CALORIES) * 100), status: 'low' as const },
    protein:  { current: dailySummary?.protein  ?? 0, target: APP_DEFAULTS.DEFAULT_PROTEIN_G, percentage: Math.round(((dailySummary?.protein  ?? 0) / APP_DEFAULTS.DEFAULT_PROTEIN_G)  * 100), status: 'low' as const },
    carbs:    { current: dailySummary?.carbs    ?? 0, target: APP_DEFAULTS.DEFAULT_CARBS_G,   percentage: Math.round(((dailySummary?.carbs    ?? 0) / APP_DEFAULTS.DEFAULT_CARBS_G)    * 100), status: 'low' as const },
    fat:      { current: dailySummary?.fat      ?? 0, target: APP_DEFAULTS.DEFAULT_FAT_G,     percentage: Math.round(((dailySummary?.fat      ?? 0) / APP_DEFAULTS.DEFAULT_FAT_G)      * 100), status: 'low' as const },
    fiber:    { current: dailySummary?.fiber    ?? 0, target: APP_DEFAULTS.DEFAULT_FIBER_G,   percentage: Math.round(((dailySummary?.fiber    ?? 0) / APP_DEFAULTS.DEFAULT_FIBER_G)    * 100), status: 'low' as const },
  }

  const progress = macroProgress ?? defaultProgress

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => handleDateChange(-1)} className="rounded-lg p-1.5 text-muted hover:bg-border/40">←</button>
          <h1 className="text-2xl font-bold text-primary">{dateLabel}</h1>
          <button onClick={() => handleDateChange(1)} className="rounded-lg p-1.5 text-muted hover:bg-border/40">→</button>
          {!isToday && (
            <button onClick={() => void fetchDayNutrition(supabase, userId, today)}
              className="rounded-lg bg-accent/10 px-3 py-1 text-xs font-medium text-accent">{t.nutr_today_btn}</button>
          )}
        </div>
        <Button onClick={() => setShowAddMeal(true)}>{t.nutr_add_meal}</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : (
        <>
          {todayWorkout?.total_calories_burned && isToday && (
            <div className="flex items-center justify-between rounded-2xl border border-pink-100 bg-pink-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">💪</span>
                <div>
                  <p className="text-sm font-medium text-pink-800">{todayWorkout.name ?? 'Antrenman'} tamamlandı</p>
                  <p className="text-xs text-pink-600">{todayWorkout.total_calories_burned} kcal {t.nutr_burned}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-pink-800">{t.nutr_net}: {Math.round((dailySummary?.calories ?? 0) - todayWorkout.total_calories_burned)} kcal</p>
                <Link href="/workout" className="text-xs text-pink-600 hover:underline">Antrenman →</Link>
              </div>
            </div>
          )}

          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-5 space-y-4">
              <MacroDashboard {...progress} />

              {/* Yiyecek Ara & Ekle */}
              <div className="glass rounded-2xl p-4">
                <h3 className="mb-3 text-sm font-semibold text-primary">{t.nutr_search_title}</h3>
                <input
                  value={foodSearch}
                  onChange={(e) => void handleFoodSearch(e.target.value)}
                  placeholder={t.nutr_search_placeholder}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm text-primary outline-none focus:border-accent"
                />
                {foodResults.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {foodResults.map((food, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-background">
                          <div>
                            <p className="text-xs font-medium text-primary">
                              {lang === 'en' && food.name_en ? food.name_en : food.name}
                            </p>
                            {(lang === 'en' ? food.name : food.name_en) && (
                              <p className="text-[10px] text-muted/70">
                                {lang === 'en' ? food.name : food.name_en}
                              </p>
                            )}
                            <p className="text-[10px] text-muted">{food.serving_size}{food.serving_unit} · P:{Math.round(food.protein)}g K:{Math.round(food.carbs)}g Y:{Math.round(food.fat)}g</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-accent">{Math.round(food.calories)} kcal</span>
                            <button
                              onClick={() => setQuickAdd(quickAdd?.food.name === food.name ? null : { food, qty: food.serving_size, mealType: 'lunch' })}
                              className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent hover:bg-accent/20"
                            >
                              {quickAdd?.food.name === food.name ? '✕' : '+'}
                            </button>
                          </div>
                        </div>

                        {quickAdd?.food.name === food.name && (
                          <div className="mx-2 mb-2 rounded-xl border border-accent/20 bg-accent/5 p-3">
                            <div className="mb-2 flex flex-wrap gap-1">
                              {(Object.keys(MEAL_TYPE_LABELS) as MealType[]).map((type) => (
                                <button key={type}
                                  onClick={() => setQuickAdd((q) => q ? { ...q, mealType: type } : q)}
                                  className={`rounded-lg px-2 py-1 text-[10px] font-medium transition-colors ${quickAdd.mealType === type ? 'bg-accent text-white' : 'bg-surface text-muted hover:bg-border/40'}`}>
                                  {MEAL_TYPE_ICONS[type]} {MEAL_TYPE_LABELS[type]}
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <input type="number" value={quickAdd.qty}
                                onChange={(e) => setQuickAdd((q) => q ? { ...q, qty: parseFloat(e.target.value) || q.food.serving_size } : q)}
                                className="w-20 rounded-lg border border-border px-2 py-1 text-sm text-primary" />
                              <span className="text-xs text-muted">{food.serving_unit}</span>
                              <span className="text-xs font-semibold text-accent ml-auto">
                                ≈{Math.round(food.calories * quickAdd.qty / food.serving_size)} kcal
                              </span>
                              <button onClick={() => void handleQuickAdd()} disabled={quickAdding}
                                className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60">
                                {quickAdding ? '…' : 'Ekle'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {foodSearch.length >= 2 && foodResults.length === 0 && (
                  <p className="mt-2 text-xs text-muted">{t.nutr_no_results}</p>
                )}
              </div>
            </div>

            <div className="col-span-7 space-y-3">
              <h2 className="text-sm font-semibold text-muted">{t.nutr_meals}</h2>
              {meals.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border py-12 text-center">
                  <p className="text-lg text-muted">{t.nutr_no_meals}</p>
                  <p className="mt-1 text-xs text-muted/60">{t.nutr_no_meals_hint}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {meals.map((meal) => (
                    <MealCard key={meal.id} meal={meal}
                      onEdit={(m) => setEditingMeal(m)}
                      onDelete={(id) => void handleDeleteMeal(id)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <MealAddModal
        open={showAddMeal}
        onClose={() => setShowAddMeal(false)}
        userId={userId}
        onSubmit={handleCreateMeal}
        onParseMeal={handleParseMeal}
      />
      <MealAddModal
        open={!!editingMeal}
        onClose={() => setEditingMeal(null)}
        userId={userId}
        onSubmit={handleCreateMeal}
        onParseMeal={handleParseMeal}
        editMeal={editingMeal}
        onUpdate={handleUpdateMeal}
      />

      {/* Nutrition AI Chat — floating panel */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {chatOpen && (
          <div className="flex w-96 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-indigo-900/20 ring-1 ring-black/5">

            {/* Header */}
            <div className="flex items-center justify-between bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg backdrop-blur-sm">
                  🥗
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{t.nutr_coach_title}</p>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_4px_rgba(110,231,183,0.8)]" />
                    <span className="text-[10px] text-white/80">{t.nutr_ai_online}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)}
                className="rounded-lg p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Kalan makro şeridi */}
            {dailySummary && target && isPro && (
              <div className="flex items-center justify-between border-b border-gray-100 bg-emerald-50/50 px-4 py-2">
                {[
                  { label: 'Kalori', cur: dailySummary.calories, tgt: target.calories, unit: 'kcal' },
                  { label: 'Protein', cur: dailySummary.protein, tgt: target.protein, unit: 'g' },
                  { label: 'Karb', cur: dailySummary.carbs, tgt: target.carbs, unit: 'g' },
                ].map(({ label, cur, tgt, unit }) => (
                  <div key={label} className="text-center">
                    <p className="text-[10px] font-medium text-gray-500">{label}</p>
                    <p className="text-xs font-bold text-emerald-700">
                      {Math.max(0, Math.round(tgt - cur))}<span className="font-normal text-gray-400">{unit} kaldı</span>
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Pro paywall */}
            {!subLoading && !isPro && (
              <div className="flex flex-col items-center px-6 py-8 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-2xl">✨</div>
                <p className="mb-1 text-sm font-semibold text-primary">{t.nutr_pro_feature}</p>
                <p className="mb-4 text-xs text-muted">{t.nutr_pro_msg}</p>
                <Link href="/billing"
                  className="rounded-xl bg-accent px-5 py-2 text-xs font-semibold text-white hover:bg-accent/90 transition-colors">
                  {t.nutr_go_pro}
                </Link>
              </div>
            )}

            {/* Mesajlar */}
            {isPro && (
              <div className="flex max-h-80 min-h-[200px] flex-col gap-3 overflow-y-auto p-4">
                {/* Karşılama balonu — her zaman görünür */}
                <div className="flex items-end gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-sm">
                    🥗
                  </div>
                  <div className="max-w-[85%] space-y-2">
                    <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-3.5 py-2.5 text-xs text-gray-800">
                      {t.nutr_ai_welcome}
                    </div>
                    {chatMessages.length === 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {[t.nutr_q1, t.nutr_q2, t.nutr_q3].map((q) => (
                          <button key={q}
                            onClick={() => { setChatInput(q); setTimeout(() => void handleSendChat(), 0) }}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-100">
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Konuşma balonları */}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    {msg.role === 'assistant' && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-sm">
                        🥗
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'rounded-br-sm bg-accent text-white'
                        : 'rounded-bl-sm bg-gray-100 text-gray-800'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}

                {/* Yazıyor animasyonu */}
                {chatLoading && (
                  <div className="flex items-end gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-sm">
                      🥗
                    </div>
                    <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-3">
                      <div className="flex items-center gap-1">
                        {[0, 150, 300].map((delay) => (
                          <span key={delay} className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-bounce"
                            style={{ animationDelay: `${delay}ms` }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            )}

            {/* Input */}
            {isPro && (
              <div className="border-t border-gray-100 p-3">
                <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-emerald-400 focus-within:bg-white transition-colors">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendChat() } }}
                    placeholder={t.nutr_placeholder}
                    className="flex-1 bg-transparent text-xs text-gray-800 outline-none placeholder:text-gray-400"
                    disabled={chatLoading}
                  />
                  <button onClick={() => void handleSendChat()}
                    disabled={chatLoading || !chatInput.trim()}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white transition hover:bg-emerald-600 disabled:opacity-40">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Floating button */}
        <div className="relative">
          {!chatOpen && (
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-30" />
          )}
          <button
            onClick={() => setChatOpen((o) => !o)}
            className={`relative flex h-14 w-14 items-center justify-center rounded-full text-xl shadow-lg transition-all duration-200 ${
              chatOpen
                ? 'bg-gray-200 text-gray-600 shadow-md'
                : 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/40 hover:shadow-emerald-500/60 hover:scale-105'
            }`}
          >
            {chatOpen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : '🥗'}
          </button>
        </div>
      </div>
    </div>
  )
}
