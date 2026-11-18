import { useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import type { FoodSearchResult } from '@lifeos/shared'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Segmented } from '@/src/components/ui/Segmented'
import { palette, fontSize, fontWeight, spacing, MIN_TOUCH } from '@/src/theme/tokens'

interface FoodChoiceAmountProps {
  choice: FoodSearchResult
  /** Gramajı alır; başarılıysa true döner, false dönerse kart açık kalır ve hata gösterilir. */
  onAdd: (grams: number) => Promise<boolean>
  onClear: () => void
}

type AmountUnit = 'piece' | 'gram'

/**
 * Listeden seçilen besinin miktarı. Tek parça besinlerde (yumurta, dilim ekmek,
 * elma) varsayılan adettir, isteyen grama geçer (#36). 1 adet = satırın porsiyonu.
 */
export function FoodChoiceAmount({ choice, onAdd, onClear }: FoodChoiceAmountProps) {
  const { colors } = useTheme()
  const { t } = useLang()
  const countable = choice.countable === true
  const [unit, setUnit] = useState<AmountUnit>(countable ? 'piece' : 'gram')
  const [value, setValue] = useState(countable ? '1' : String(choice.default_grams))
  const [adding, setAdding] = useState(false)
  const [failed, setFailed] = useState(false)

  function typedAmount(): number | null {
    const typed = Number(value.replace(',', '.'))
    return Number.isFinite(typed) && typed > 0 ? typed : null
  }

  /** Birim değişince girilen miktar korunur: 3 adet ↔ 3 × porsiyon gram. */
  function switchUnit(next: AmountUnit) {
    if (next === unit) return
    const typed = typedAmount()
    setUnit(next)
    if (typed === null) {
      setValue(next === 'piece' ? '1' : String(choice.default_grams))
    } else if (next === 'gram') {
      setValue(String(Math.round(typed * choice.default_grams)))
    } else {
      setValue(String(Math.round((typed / choice.default_grams) * 10) / 10))
    }
  }

  function gramsFromInput(): number {
    const typed = typedAmount()
    if (typed === null) return choice.default_grams
    return unit === 'piece' ? Math.round(typed * choice.default_grams) : typed
  }

  async function handleAdd() {
    setFailed(false)
    setAdding(true)
    const ok = await onAdd(gramsFromInput())
    setAdding(false)
    if (!ok) setFailed(true)
  }

  return (
    <GlassCard padding={spacing[3]} noShadow>
      <View style={{ gap: spacing[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] }}>
        <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{choice.label}</Text>
        <TouchableOpacity
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={t.ux_food_choice_clear}
          style={{ width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={18} color={colors.textSubtle} />
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle }}>
        {choice.kcal_per_100g} kcal / 100 g
        {choice.source === 'corpus' ? ' · USDA' : ''}
      </Text>
      {countable && (
        <Segmented<AmountUnit>
          options={[
            { key: 'piece', label: t.ux_food_unit_piece.replace('{g}', String(choice.default_grams)) },
            { key: 'gram', label: t.nutr_grams },
          ]}
          value={unit}
          onChange={switchUnit}
          style={{ marginBottom: 0 }}
        />
      )}
      <Input
        testID="food-amount"
        label={unit === 'piece' ? t.ux_food_amount_piece : t.nutr_grams}
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
        placeholder={unit === 'piece' ? '1' : String(choice.default_grams)}
      />
      {failed && (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: palette.danger }}>{t.nut_err_add_food_msg}</Text>
      )}
      <Button label={t.nutr_add_to_meal} onPress={() => void handleAdd()} loading={adding} variant="secondary" fullWidth />
      </View>
    </GlassCard>
  )
}
