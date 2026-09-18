import { useMemo } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { EQUIPMENT, planProgramAdaptation } from '@lifeos/shared'
import type { EquipmentKey, Exercise, ProgramAdaptation, WorkoutProgram } from '@lifeos/shared'
import { Button } from '../ui/Button'
import { useTheme } from '../../contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  program: WorkoutProgram
  catalog: Exercise[]
  owned: EquipmentKey[]
  applying: boolean
  onBack: () => void
  onApply: (adaptation: ProgramAdaptation) => void
}

/**
 * "Ekipmanıma uyarla" önizlemesi. Plan saf fonksiyondan geliyor, burada hiçbir
 * şey yazılmıyor: kullanıcı hangi hareketin neyle değişeceğini ve hangisinin
 * düşeceğini görüp sonra onaylıyor. Şablonda kopya açılır, kendi programı
 * yerinde değişir; düğme metni bu farkı söyler.
 */
export function AdaptProgramView({ program, catalog, owned, applying, onBack, onApply }: Props) {
  const { colors } = useTheme()
  const adaptation = useMemo(() => planProgramAdaptation(program, catalog, owned), [program, catalog, owned])
  const isTemplate = program.user_id === null
  const nothingLeft = adaptation.days.every(({ steps }) => steps.every((step) => step.kind === 'drop'))

  const summary = [
    adaptation.replaced > 0 ? `${adaptation.replaced} hareket değişecek` : null,
    adaptation.dropped > 0 ? `${adaptation.dropped} hareket çıkarılacak` : null,
  ].filter(Boolean).join(', ') || 'Tüm hareketler eldeki aletlerle yapılabiliyor'

  return (
    <View style={{ gap: spacing[3] }}>
      <TouchableOpacity onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[1] }}>
        <Ionicons name="chevron-back" size={16} color={palette.accent} />
        <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>Programa dön</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{summary}.</Text>

      {adaptation.days.filter(({ day }) => !day.is_rest).map(({ day, steps }) => (
        <View key={day.id} style={{ borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border, padding: spacing[3], gap: spacing[2] }}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
            {day.day_name || `Gün ${day.day_number}`}
          </Text>
          {steps.length === 0 && (
            <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>Bu günde tanımlı hareket yok.</Text>
          )}
          {steps.map((step) => {
            const name = step.row.exercise?.name ?? 'Egzersiz'
            if (step.kind === 'keep') {
              return (
                <View key={step.row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                  <Ionicons name="checkmark" size={14} color={colors.textSubtle} />
                  <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textSecondary }} numberOfLines={1}>{name}</Text>
                </View>
              )
            }
            if (step.kind === 'replace') {
              return (
                <View key={step.row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                  <Ionicons name="swap-horizontal" size={14} color={palette.workout} />
                  <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textPrimary }} numberOfLines={2}>
                    <Text style={{ color: colors.textMuted, textDecorationLine: 'line-through' }}>{name}</Text>
                    {'  '}
                    <Text style={{ fontWeight: fontWeight.medium }}>{step.substitute.name}</Text>
                  </Text>
                </View>
              )
            }
            const missing = step.missing.map((key) => EQUIPMENT[key].label).join(', ')
            return (
              <View key={step.row.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
                <Ionicons name="remove-circle-outline" size={14} color={palette.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, textDecorationLine: 'line-through' }} numberOfLines={1}>{name}</Text>
                  <Text style={{ fontSize: fontSize.xs, color: palette.danger }}>Karşılığı yok · gereken: {missing}</Text>
                </View>
              </View>
            )
          })}
        </View>
      ))}

      {nothingLeft ? (
        <Text style={{ fontSize: fontSize.sm, color: palette.danger, textAlign: 'center' }}>
          Bu programın hiçbir hareketi eldeki aletlerle yapılamıyor.
        </Text>
      ) : (
        <Button
          label={applying ? 'Uygulanıyor...' : isTemplate ? 'Uyarlanmış kopyayı kaydet' : 'Programı güncelle'}
          onPress={() => onApply(adaptation)}
          loading={applying}
          fullWidth
        />
      )}
    </View>
  )
}
