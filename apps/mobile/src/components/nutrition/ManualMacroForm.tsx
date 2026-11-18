import { useState } from 'react'
import { View, Text } from 'react-native'
import { caloriesFromMacros } from '@lifeos/shared'
import type { MealItem } from '@lifeos/shared'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, spacing } from '@/src/theme/tokens'

interface ManualMacroFormProps {
  onAdd: (item: MealItem) => void
}

const EMPTY = { name: '', calories: '', protein: '', carbs: '', fat: '' }

/** Boş alan 0 sayılır; sayı değilse ya da negatifse null (hata gösterilir). */
function toNumber(text: string): number | null {
  if (!text.trim()) return 0
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Etiketten ya da tariften bilinen değerlerle elle kalem (#25). Kalori boş
 * bırakılırsa makrolardan hesaplanır. Kalem 1 porsiyon olarak eklenir, miktarı
 * listede değiştirilince değerler orantılı ölçeklenir.
 */
export function ManualMacroForm({ onAdd }: ManualMacroFormProps) {
  const { colors } = useTheme()
  const { t } = useLang()
  const [draft, setDraft] = useState(EMPTY)
  const [error, setError] = useState<string | null>(null)

  const parsed = { protein: toNumber(draft.protein), carbs: toNumber(draft.carbs), fat: toNumber(draft.fat), calories: toNumber(draft.calories) }
  const invalid = (Object.keys(parsed) as (keyof typeof parsed)[]).filter((k) => parsed[k] === null)
  const protein = parsed.protein ?? 0
  const carbs = parsed.carbs ?? 0
  const fat = parsed.fat ?? 0
  const typedCalories = parsed.calories ?? 0
  const calories = typedCalories > 0 ? Math.round(typedCalories) : caloriesFromMacros(protein, carbs, fat)

  function set(field: keyof typeof EMPTY, value: string) {
    setDraft((d) => ({ ...d, [field]: value }))
  }

  function handleAdd() {
    const name = draft.name.trim()
    if (!name) { setError(t.ux_manual_name_required); return }
    if (invalid.length > 0) { setError(t.ux_manual_invalid_number); return }
    if (calories <= 0) { setError(t.ux_manual_values_required); return }
    setError(null)
    onAdd({ name, amount: 1, unit: t.ux_manual_unit, calories, protein, carbs, fat, fiber: 0 })
    setDraft(EMPTY)
  }

  return (
    <View style={{ gap: spacing[3] }}>
      <Input testID="manual-food-name" label={t.ux_manual_name} value={draft.name} onChangeText={(v) => set('name', v)} returnKeyType="next" />
      <View style={{ flexDirection: 'row', gap: spacing[3] }}>
        <Input label={t.acc_protein_g} value={draft.protein} onChangeText={(v) => set('protein', v)} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
        <Input label={t.acc_carbs_g} value={draft.carbs} onChangeText={(v) => set('carbs', v)} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
        <Input label={t.acc_fat_g} value={draft.fat} onChangeText={(v) => set('fat', v)} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
      </View>
      <Input
        label={t.ux_manual_kcal}
        value={draft.calories}
        onChangeText={(v) => set('calories', v)}
        keyboardType="decimal-pad"
        placeholder={calories > 0 ? String(calories) : '0'}
      />
      <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{t.ux_manual_total.replace('{kcal}', String(calories))}</Text>
      {error && (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: palette.danger }}>{error}</Text>
      )}
      <Button label={t.nutr_add_to_meal} onPress={handleAdd} variant="secondary" fullWidth />
    </View>
  )
}
