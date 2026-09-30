import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, Alert } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { usePlanningStore } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Button } from '@/src/components/ui/Button'
import { RitualSheet } from '@/src/components/planning/RitualSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

const ENERGY_LEVELS = [
  { level: 1 as const, emoji: '😴', label: 'Bitkin' },
  { level: 2 as const, emoji: '😑', label: 'Düşük' },
  { level: 3 as const, emoji: '😐', label: 'Orta' },
  { level: 4 as const, emoji: '😊', label: 'İyi' },
  { level: 5 as const, emoji: '🔥', label: 'Harika' },
]

interface Props { userId: string }

/**
 * Günün ilk girdisi. Ritüel bekliyorsa tek kart: soru, enerji ve "Günü planla".
 * Ritüel bitince kart kalkar; enerji başlığın altında ince bir satırda değiştirilebilir.
 * Sabah bildirimi `?ritual=1` ile açar (notifications/setup.ts).
 */
export function DayStartCard({ userId }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { ritual } = useLocalSearchParams<{ ritual?: string }>()
  const { dailyPlan, setEnergyLevel, completeRitual } = usePlanningStore()
  const [ritualOpen, setRitualOpen] = useState(false)

  const ritualPending = !!dailyPlan && !dailyPlan.ritual_completed_at
  useEffect(() => { if (ritual === '1' && ritualPending) setRitualOpen(true) }, [ritual, ritualPending])

  if (!dailyPlan) return null

  const pick = (level: 1 | 2 | 3 | 4 | 5) => {
    setEnergyLevel(supabase, level).catch(() => Alert.alert('Hata', 'Enerji seviyesi kaydedilemedi'))
  }
  const skip = () => { completeRitual(supabase).catch(() => Alert.alert(t.ritual_error)) }

  const sheet = <RitualSheet userId={userId} visible={ritualOpen} onClose={() => setRitualOpen(false)} />

  if (!ritualPending) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing[4], paddingHorizontal: spacing[1] }}>
        <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textMuted }}>{t.plan_energy}</Text>
        <View style={{ flexDirection: 'row', gap: spacing[1] }}>
          {ENERGY_LEVELS.map(({ level, emoji, label }) => {
            const active = dailyPlan.energy_level === level
            return (
              <TouchableOpacity key={level} onPress={() => pick(level)} accessibilityLabel={label} accessibilityState={{ selected: active }}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? `${palette.accent}1F` : 'transparent', opacity: active || !dailyPlan.energy_level ? 1 : 0.45 }}>
                <Text style={{ fontSize: 18 }}>{emoji}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {sheet}
      </View>
    )
  }

  return (
    <GlassCard style={{ marginBottom: spacing[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: `${palette.warning}22` }}>
          <Text style={{ fontSize: 20 }}>☀️</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.ritual_banner}</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 }}>{t.plan_energy_q}</Text>
        </View>
        <TouchableOpacity onPress={skip} hitSlop={10}>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSubtle }}>{t.ritual_skip}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: spacing[4] }}>
        {ENERGY_LEVELS.map(({ level, emoji, label }) => {
          const active = dailyPlan.energy_level === level
          return (
            <TouchableOpacity key={level} onPress={() => pick(level)} accessibilityLabel={label} accessibilityState={{ selected: active }}
              style={{ alignItems: 'center', gap: 4, width: 56 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? `${palette.accent}1F` : colors.bg, borderWidth: 2, borderColor: active ? palette.accent : 'transparent' }}>
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </View>
              <Text style={{ fontSize: fontSize.xs, color: active ? palette.accent : colors.textSubtle, fontWeight: active ? fontWeight.semibold : fontWeight.regular }}>{label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <Button label={t.ritual_start} onPress={() => setRitualOpen(true)} fullWidth />
      {sheet}
    </GlassCard>
  )
}
