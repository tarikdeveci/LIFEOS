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
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

const ENERGY_LEVELS = [
  { level: 1 as const, emoji: '😴', label: 'Bitkin' },
  { level: 2 as const, emoji: '😑', label: 'Düşük' },
  { level: 3 as const, emoji: '😐', label: 'Orta' },
  { level: 4 as const, emoji: '😊', label: 'İyi' },
  { level: 5 as const, emoji: '🔥', label: 'Harika' },
]

interface Props { userId: string }

/**
 * Günün ilk girdisi: enerji ve sabah ritüeli tek kartta. Ritüel bitene kadar
 * tam kart; sonra tek satırlık enerji seçici kalır (AI planı enerjiye göre kurulur).
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

  const energyRow = (compact: boolean) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: compact ? spacing[1] : 0 }}>
      {ENERGY_LEVELS.map(({ level, emoji, label }) => {
        const active = dailyPlan.energy_level === level
        return (
          <TouchableOpacity key={level} onPress={() => pick(level)} accessibilityLabel={label} accessibilityState={{ selected: active }}
            style={{ flex: compact ? 0 : 1, alignItems: 'center', gap: 4, paddingVertical: compact ? 4 : spacing[2], paddingHorizontal: compact ? 6 : 0, marginHorizontal: compact ? 0 : 2, borderRadius: radius.lg, backgroundColor: active ? `${palette.accent}18` : 'transparent', borderWidth: active ? 1 : 0, borderColor: palette.accent }}>
            <Text style={{ fontSize: compact ? 18 : 22 }}>{emoji}</Text>
            {!compact && <Text style={{ fontSize: fontSize.xs, color: active ? palette.accent : colors.textSubtle, fontWeight: active ? fontWeight.semibold : fontWeight.regular }}>{label}</Text>}
          </TouchableOpacity>
        )
      })}
    </View>
  )

  return (
    <>
      {ritualPending ? (
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.ritual_banner}</Text>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, marginBottom: spacing[2] }}>{t.plan_energy_q}</Text>
          {energyRow(false)}
          <View style={{ flexDirection: 'row', gap: spacing[3], marginTop: spacing[3] }}>
            <Button label={t.ritual_start} onPress={() => setRitualOpen(true)} size="sm" />
            <Button label={t.ritual_skip} onPress={() => void completeRitual(supabase).catch(() => Alert.alert(t.ritual_error))} size="sm" variant="ghost" />
          </View>
        </GlassCard>
      ) : (
        <GlassCard style={{ marginBottom: spacing[4] }} padding={spacing[3]}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{t.plan_energy}</Text>
            {energyRow(true)}
          </View>
        </GlassCard>
      )}
      <RitualSheet userId={userId} visible={ritualOpen} onClose={() => setRitualOpen(false)} />
    </>
  )
}
