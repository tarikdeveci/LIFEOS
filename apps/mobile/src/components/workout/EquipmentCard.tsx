import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { equipmentLabel } from '@lifeos/shared'
import type { EquipmentKey, ProgramEquipmentFit } from '@lifeos/shared'
import { GlassCard } from '../ui/GlassCard'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface CardProps {
  equipment: EquipmentKey[] | null
  loaded: boolean
  onEdit: () => void
}

/** Kısa özet: ilk üç aletin adı, kalanı sayı. */
function summarize(equipment: EquipmentKey[], lang: 'tr' | 'en', bodyweightOnly: string): string {
  if (equipment.length === 0) return bodyweightOnly
  const names = equipment.slice(0, 3).map((key) => equipmentLabel(key, lang))
  const rest = equipment.length - names.length
  return rest > 0 ? `${names.join(', ')} +${rest}` : names.join(', ')
}

/**
 * Programlar sekmesinin üstündeki "Ekipmanım" kartı. Seçim yokken bunu
 * saklamıyor, aksine söylüyor: kullanıcı programların neden salon hareketi
 * içerdiğini bilsin ve tek dokunuşla düzeltebilsin.
 */
export function EquipmentCard({ equipment, loaded, onEdit }: CardProps) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const chosen = equipment !== null

  return (
    <GlassCard padding={spacing[4]} noShadow>
      <TouchableOpacity onPress={onEdit} disabled={!loaded} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.workout}18`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="construct-outline" size={18} color={palette.workout} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.wk_my_equipment}</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }} numberOfLines={2}>
            {!loaded
              ? t.wk_loading
              : chosen
                ? summarize(equipment, lang, t.wk_bodyweight_only)
                : t.wk_not_chosen}
          </Text>
        </View>
        <View style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: `${palette.workout}18`, borderWidth: 1, borderColor: `${palette.workout}30` }}>
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.workout }}>{chosen ? t.wk_edit : t.wk_choose}</Text>
        </View>
      </TouchableOpacity>
    </GlassCard>
  )
}

/**
 * Program kartındaki uyumluluk rozeti. Kullanıcı seçim yapmadıysa çizilmez:
 * "tam salona uygun" demek bilgi vermiyor.
 */
export function ProgramFitBadge({ fit }: { fit: ProgramEquipmentFit | null }) {
  const { t } = useLang()
  if (!fit || fit.total === 0) return null
  const unavailable = fit.total - fit.available
  const ok = unavailable === 0
  const tint = ok ? palette.success : palette.warning
  const label = ok
    ? t.wk_fits_yours
    : t.wk_lacks_n.replace('{n}', String(unavailable))

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, backgroundColor: `${tint}12`, borderWidth: 1, borderColor: `${tint}25` }}>
      <Ionicons name={ok ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={12} color={tint} />
      <Text style={{ fontSize: fontSize.xs, color: tint, fontWeight: fontWeight.medium }}>{label}</Text>
    </View>
  )
}
