import { View, Text, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { EQUIPMENT } from '@lifeos/shared'
import type { EquipmentKey, ProgramEquipmentFit } from '@lifeos/shared'
import { GlassCard } from '../ui/GlassCard'
import { useTheme } from '../../contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface CardProps {
  equipment: EquipmentKey[] | null
  loaded: boolean
  onEdit: () => void
}

/** Kısa özet: ilk üç aletin adı, kalanı sayı. */
function summarize(equipment: EquipmentKey[]): string {
  if (equipment.length === 0) return 'Sadece vücut ağırlığı'
  const names = equipment.slice(0, 3).map((key) => EQUIPMENT[key].label)
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
  const chosen = equipment !== null

  return (
    <GlassCard padding={spacing[4]} noShadow>
      <TouchableOpacity onPress={onEdit} disabled={!loaded} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${palette.workout}18`, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="construct-outline" size={18} color={palette.workout} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>Ekipmanım</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }} numberOfLines={2}>
            {!loaded
              ? 'Yükleniyor...'
              : chosen
                ? summarize(equipment)
                : 'Seçilmedi: programlar tam donanımlı salon varsayıyor'}
          </Text>
        </View>
        <View style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: `${palette.workout}18`, borderWidth: 1, borderColor: `${palette.workout}30` }}>
          <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: palette.workout }}>{chosen ? 'Düzenle' : 'Seç'}</Text>
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
  if (!fit || fit.total === 0) return null
  const unavailable = fit.total - fit.available
  const ok = unavailable === 0
  const tint = ok ? palette.success : palette.warning
  const label = ok
    ? 'Ekipmanına uygun'
    : `${unavailable} hareket için alet yok`

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing[3], paddingVertical: 4, borderRadius: radius.full, backgroundColor: `${tint}12`, borderWidth: 1, borderColor: `${tint}25` }}>
      <Ionicons name={ok ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={12} color={tint} />
      <Text style={{ fontSize: fontSize.xs, color: tint, fontWeight: fontWeight.medium }}>{label}</Text>
    </View>
  )
}
