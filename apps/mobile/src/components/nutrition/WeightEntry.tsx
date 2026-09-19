import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { formatWeightKg } from '@lifeos/shared'
import { WEIGHT_LOG_MAX_KG, WEIGHT_LOG_MIN_KG } from '@lifeos/shared/supabase'
import { Button } from '../ui/Button'
import { useTheme } from '../../contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  /** Başlangıç değeri: son tartı, hiç tartı yoksa profildeki kilo, o da yoksa null. */
  initialKg: number | null
  /** Bugün için kayıt var mı: düğme "güncelle" der, aynı değer tekrar yazılmaz. */
  savedToday: boolean
  /** Kayıt sürüyor: düğmede gösterge döner. */
  saving: boolean
  /** Kartta başka bir işlem sürüyor. */
  disabled: boolean
  onSave: (kg: number) => Promise<boolean>
}

const STEP_KG = 0.1
/** Hiç tartı yokken artı/eksi düğmesinin başladığı değer. */
const FALLBACK_KG = 70

function parseKg(text: string): number {
  return Number.parseFloat(text.replace(',', '.'))
}

/**
 * Günün tartısı: son değerle dolu gelir, çoğu gün yalnızca artı/eksiye basıp
 * kaydetmek yeter. Değer klavyeyle de yazılabilir. Değer değişince kartın
 * yeniden kurması için üst bileşen `key` verir.
 */
export function WeightEntry({ initialKg, savedToday, saving, disabled, onSave }: Props) {
  const busy = saving || disabled
  const { colors } = useTheme()
  const [text, setText] = useState(initialKg !== null ? formatWeightKg(initialKg) : '')

  const parsed = parseKg(text)
  const valid = Number.isFinite(parsed) && parsed >= WEIGHT_LOG_MIN_KG && parsed <= WEIGHT_LOG_MAX_KG
  const unchanged = savedToday && initialKg !== null && valid && Math.round(parsed * 10) === Math.round(initialKg * 10)

  function step(delta: number) {
    const base = Number.isFinite(parsed) ? parsed : initialKg ?? FALLBACK_KG
    const next = Math.round((base + delta) * 10) / 10
    setText(formatWeightKg(Math.min(WEIGHT_LOG_MAX_KG, Math.max(WEIGHT_LOG_MIN_KG, next))))
  }

  function stepButton(icon: 'remove' | 'add', delta: number, label: string) {
    return (
      <TouchableOpacity
        onPress={() => step(delta)}
        disabled={busy}
        accessibilityLabel={label}
        style={{ width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: `${palette.accent}14` }}
      >
        <Ionicons name={icon} size={22} color={palette.accent} />
      </TouchableOpacity>
    )
  }

  return (
    <View style={{ gap: spacing[3] }}>
      <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.textMuted, textAlign: 'center' }}>
        Bugünkü kilon
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[4] }}>
        {stepButton('remove', -STEP_KG, '100 gram azalt')}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput
            value={text}
            onChangeText={setText}
            keyboardType="decimal-pad"
            placeholder="0,0"
            placeholderTextColor={colors.textSubtle}
            selectTextOnFocus
            maxLength={5}
            editable={!busy}
            style={{ minWidth: 104, paddingVertical: 0, fontSize: fontSize['4xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, textAlign: 'center', fontVariant: ['tabular-nums'] }}
          />
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textMuted, marginLeft: 2 }}>kg</Text>
        </View>
        {stepButton('add', STEP_KG, '100 gram artır')}
      </View>
      {text.trim() !== '' && !valid && (
        <Text style={{ fontSize: fontSize.xs, color: palette.danger, textAlign: 'center' }}>
          {WEIGHT_LOG_MIN_KG} ile {WEIGHT_LOG_MAX_KG} kg arasında bir değer gir.
        </Text>
      )}
      <Button
        label={unchanged ? 'Bugün kaydedildi' : savedToday ? 'Bugünkü tartıyı güncelle' : 'Bugünkü tartıyı kaydet'}
        onPress={() => {
          if (valid) void onSave(parsed)
        }}
        loading={saving}
        disabled={busy || !valid || unchanged}
        fullWidth
      />
    </View>
  )
}
