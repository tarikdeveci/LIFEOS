import { useEffect } from 'react'
import { View, Text, ScrollView, Switch, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'
import { useCalendarStore } from '@/src/stores/calendarStore'

export default function CalendarSettingsScreen() {
  const { colors } = useTheme()
  const {
    availableCalendars,
    selectedCalendarIds,
    toggleCalendar,
    syncEvents,
    isSyncing,
    lastSyncedAt,
    hasPermission,
    initialize,
  } = useCalendarStore()

  useEffect(() => {
    void initialize()
  }, [initialize])

  const lastSyncText = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
    : 'Henüz senkronize edilmedi'

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={{ padding: spacing[5], paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[5] }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>
            Takvim Senkronizasyonu
          </Text>
        </View>

        {/* Açıklama */}
        <GlassCard style={{ marginBottom: spacing[5] }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>
            Seçilen takvimlerden etkinlikler LifeOS planlayıcısında gösterilir. Etkinlikler yalnızca görüntülenir, değiştirilemez.
          </Text>
        </GlassCard>

        {/* İzin yoksa */}
        {!hasPermission && (
          <GlassCard style={{ marginBottom: spacing[5] }}>
            <View style={{ alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3] }}>
              <Ionicons name="calendar-outline" size={40} color={colors.textSubtle} />
              <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary, textAlign: 'center' }}>
                Takvim izni gerekiyor
              </Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' }}>
                Cihaz takvimine erişmek için izin verin.
              </Text>
              <Button label="İzin Ver" onPress={() => void initialize()} />
            </View>
          </GlassCard>
        )}

        {/* Takvim listesi */}
        {hasPermission && availableCalendars.length > 0 && (
          <View style={{ gap: spacing[3], marginBottom: spacing[5] }}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              TAKVİMLER
            </Text>
            {availableCalendars.map((calendar) => (
              <GlassCard key={calendar.id} padding={spacing[4]} noShadow>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: (calendar.color as string | undefined) ?? colors.textSubtle }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
                      {calendar.title}
                    </Text>
                    <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                      {(calendar.source as { name?: string } | undefined)?.name ?? 'Cihaz'}
                    </Text>
                  </View>
                  <Switch
                    value={selectedCalendarIds.includes(calendar.id)}
                    onValueChange={() => void toggleCalendar(calendar.id)}
                    trackColor={{ false: colors.glassBorder, true: `${palette.accent}80` }}
                    thumbColor={selectedCalendarIds.includes(calendar.id) ? palette.accent : colors.textSubtle}
                  />
                </View>
              </GlassCard>
            ))}
          </View>
        )}

        {/* Senkronizasyon butonu */}
        {hasPermission && (
          <View style={{ gap: spacing[3] }}>
            <Button
              label={isSyncing ? 'Senkronize ediliyor...' : 'Şimdi Senkronize Et'}
              onPress={() => void syncEvents()}
              variant="secondary"
              fullWidth
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], justifyContent: 'center' }}>
              {isSyncing && <ActivityIndicator size="small" color={palette.accent} />}
              <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
                Son senkronizasyon: {lastSyncText}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenBackground>
  )
}
