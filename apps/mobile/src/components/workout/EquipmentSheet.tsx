import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, Alert } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { EQUIPMENT, EQUIPMENT_GROUP_LABELS, EQUIPMENT_KEYS, EQUIPMENT_PRESETS } from '@lifeos/shared'
import type { EquipmentGroup, EquipmentKey } from '@lifeos/shared'
import { BottomSheet } from '../ui/BottomSheet'
import { Button } from '../ui/Button'
import { useTheme } from '../../contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  visible: boolean
  onClose: () => void
  /** Kayıtlı seçim. null = hiç seçilmemiş, sayfa boş başlar. */
  initial: EquipmentKey[] | null
  onSave: (equipment: EquipmentKey[]) => Promise<void>
}

const GROUP_ORDER = Object.keys(EQUIPMENT_GROUP_LABELS) as EquipmentGroup[]

function sameSet(a: ReadonlySet<EquipmentKey>, b: readonly EquipmentKey[]): boolean {
  return a.size === b.length && b.every((key) => a.has(key))
}

/**
 * Erişilebilen aletlerin tek tek işaretlendiği sayfa. Hazır kurulumlar yalnızca
 * başlangıç noktası: dokununca seçim o listeye döner, üstüne ekleme çıkarma
 * serbest. Seçim yalnızca "Kaydet" ile yazılır; sayfayı kapatmak vazgeçmektir.
 */
export function EquipmentSheet({ visible, onClose, initial, onSave }: Props) {
  const { colors } = useTheme()
  const [selected, setSelected] = useState<Set<EquipmentKey>>(new Set())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) setSelected(new Set(initial ?? []))
  }, [visible, initial])

  function toggle(key: EquipmentKey) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      await onSave([...selected])
      onClose()
    } catch (err) {
      Alert.alert('Hata', err instanceof Error ? err.message : 'Ekipman kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Ekipmanım" scrollable>
      <View style={{ gap: spacing[4] }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
          Erişebildiğin aletleri işaretle. Programlar buna göre süzülür ve uyarlanır; koç da yalnızca bu aletlerle program yazar.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          {EQUIPMENT_PRESETS.map((preset) => {
            const active = sameSet(selected, preset.keys)
            return (
              <TouchableOpacity
                key={preset.id}
                onPress={() => setSelected(new Set(preset.keys))}
                style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: active ? palette.workout : colors.glassInner, borderWidth: 1, borderColor: active ? palette.workout : colors.border }}
              >
                <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: active ? '#fff' : colors.textMuted }}>{preset.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {GROUP_ORDER.map((group) => (
          <View key={group} style={{ gap: spacing[2] }}>
            <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {EQUIPMENT_GROUP_LABELS[group]}
            </Text>
            {EQUIPMENT_KEYS.filter((key) => EQUIPMENT[key].group === group).map((key) => {
              const info = EQUIPMENT[key]
              const on = selected.has(key)
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => toggle(key)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: 10, paddingHorizontal: spacing[3], borderRadius: radius.lg, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: on ? palette.workout : colors.border }}
                >
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? palette.workout : colors.textSubtle} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{info.label}</Text>
                    {info.hint && (
                      <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 }}>{info.hint}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        ))}

        <Button
          label={saving ? 'Kaydediliyor...' : selected.size === 0 ? 'Sadece vücut ağırlığı olarak kaydet' : `Kaydet (${selected.size} alet)`}
          onPress={() => void handleSave()}
          loading={saving}
          fullWidth
        />
      </View>
    </BottomSheet>
  )
}
