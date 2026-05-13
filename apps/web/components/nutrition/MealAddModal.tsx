'use client'

import { useState, useCallback, useEffect } from 'react'
import type { MealType, CreateMealInput, MealItem, Meal } from '@lifeos/shared'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ICONS } from '@lifeos/shared'
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

interface MealAddModalProps {
  open: boolean
  onClose: () => void
  onSubmit: (input: CreateMealInput) => Promise<void>
  onParseMeal?: (rawInput: string) => Promise<MealItem[]>
  editMeal?: Meal | null
  onUpdate?: (mealId: string, updates: Partial<CreateMealInput>) => Promise<void>
}

export function MealAddModal({ open, onClose, onSubmit, onParseMeal, editMeal, onUpdate }: MealAddModalProps) {
  const isEdit = !!editMeal
  const [mealType, setMealType]     = useState<MealType>('lunch')
  const [rawInput, setRawInput]     = useState('')
  const [parsedItems, setParsedItems] = useState<MealItem[]>([])
  const [rates, setRates]           = useState<MacroRate[]>([])
  const [parsing, setParsing]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [step, setStep]             = useState<'input' | 'review'>('input')
  const { showToast } = useToast()

  const initRates = useCallback((items: MealItem[]) => setRates(items.map(calcRate)), [])

  useEffect(() => {
    if (editMeal) {
      setMealType(editMeal.meal_type)
      setRawInput(editMeal.raw_input ?? '')
      setParsedItems(editMeal.items)
      initRates(editMeal.items)
      setStep('review')
    } else {
      setMealType('lunch'); setRawInput(''); setParsedItems([]); setRates([]); setStep('input')
    }
  }, [editMeal, open, initRates])

  const handleParse = useCallback(async () => {
    if (!rawInput.trim() || !onParseMeal) return
    setParsing(true)
    try {
      const items = await onParseMeal(rawInput)
      setParsedItems(items); initRates(items); setStep('review')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Öğün parse edilemedi.', 'error')
    } finally { setParsing(false) }
  }, [rawInput, onParseMeal, showToast, initRates])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      if (isEdit && editMeal && onUpdate) {
        await onUpdate(editMeal.id, { meal_type: mealType, items: parsedItems })
      } else {
        await onSubmit({ meal_type: mealType, raw_input: rawInput, items: parsedItems })
      }
      onClose()
    } finally { setSaving(false) }
  }, [isEdit, editMeal, mealType, rawInput, parsedItems, onSubmit, onUpdate, onClose])

  const handleAmountChange = useCallback((index: number, newAmount: number) => {
    const rate = rates[index]
    if (!rate || !newAmount) return
    setParsedItems((items) =>
      items.map((item, i) => i === index ? { ...item, ...applyRate(rate, newAmount) } : item)
    )
  }, [rates])

  const handleNameChange = useCallback((index: number, name: string) => {
    setParsedItems((items) => items.map((item, i) => i === index ? { ...item, name } : item))
  }, [])

  const handleRemoveItem = useCallback((index: number) => {
    setParsedItems((items) => items.filter((_, i) => i !== index))
    setRates((r) => r.filter((_, i) => i !== index))
  }, [])

  const handleAddItem = useCallback(() => {
    const blank: MealItem = { name: '', amount: 100, unit: 'g', calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    setParsedItems((items) => [...items, blank])
    setRates((r) => [...r, calcRate(blank)])
  }, [])

  const totalCalories = parsedItems.reduce((s, i) => s + (i.calories || 0), 0)
  const totalProtein  = parsedItems.reduce((s, i) => s + (i.protein  || 0), 0)
  const totalCarbs    = parsedItems.reduce((s, i) => s + (i.carbs    || 0), 0)
  const totalFat      = parsedItems.reduce((s, i) => s + (i.fat      || 0), 0)

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
            <Textarea
              label={isEdit ? 'Öğünü yeniden parse et' : 'Ne yedin?'}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              rows={4}
              placeholder="Örn: 2 yumurta, 2 dilim tam buğday ekmeği, beyaz peynir, çay"
            />
            <div className="flex justify-between gap-2">
              {isEdit
                ? <Button variant="ghost" size="sm" onClick={() => setStep('review')}>← İptal, Geri Dön</Button>
                : <Button variant="ghost" size="sm" onClick={onClose}>İptal</Button>
              }
              {onParseMeal
                ? <Button size="sm" onClick={() => void handleParse()} loading={parsing} disabled={!rawInput.trim()}>🤖 AI ile Hesapla</Button>
                : <Button size="sm" onClick={() => void handleSave()} loading={saving} disabled={!rawInput.trim()}>Kaydet</Button>
              }
            </div>
          </>
        )}

        {step === 'review' && (
          <>
            {/* Yiyecek listesi — düzenlenebilir */}
            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {parsedItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2">
                  {/* İsim */}
                  <input
                    value={item.name}
                    onChange={(e) => handleNameChange(idx, e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium text-primary outline-none hover:border-gray-200 focus:border-accent focus:bg-white"
                  />
                  {/* Miktar */}
                  <input
                    type="number"
                    value={item.amount}
                    onChange={(e) => handleAmountChange(idx, parseFloat(e.target.value) || 0)}
                    className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-xs text-primary outline-none focus:border-accent"
                    min={0}
                  />
                  {/* Birim */}
                  <span className="shrink-0 text-[10px] text-muted">{item.unit}</span>
                  {/* Kalori */}
                  <span className="shrink-0 w-14 text-right text-xs font-semibold text-accent">{item.calories} kcal</span>
                  {/* Sil */}
                  <button
                    onClick={() => handleRemoveItem(idx)}
                    className="shrink-0 rounded-lg p-1 text-muted hover:bg-danger/10 hover:text-danger"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            {/* Yeni satır ekle */}
            <button
              onClick={handleAddItem}
              className="w-full rounded-xl border border-dashed border-gray-200 py-2 text-xs font-medium text-muted hover:border-accent hover:text-accent"
            >
              + Yiyecek Ekle
            </button>

            {/* Toplam */}
            <div className="flex items-center justify-between rounded-xl bg-accent/5 px-4 py-2.5">
              <span className="text-sm font-bold text-primary">{totalCalories} kcal</span>
              <div className="flex gap-3 text-[11px]">
                <span className="font-semibold text-blue-500">P {Math.round(totalProtein)}g</span>
                <span className="font-semibold text-amber-500">K {Math.round(totalCarbs)}g</span>
                <span className="font-semibold text-red-500">Y {Math.round(totalFat)}g</span>
                <span className="font-semibold text-green-500">L {Math.round(parsedItems.reduce((s,i) => s + i.fiber, 0))}g</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setStep('input')}>
                {isEdit ? '↻ Yeniden Hesapla' : '← Geri'}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>İptal</Button>
                <Button size="sm" onClick={() => void handleSave()} loading={saving} disabled={parsedItems.length === 0}>
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
