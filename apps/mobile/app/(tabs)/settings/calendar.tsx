import { useEffect } from 'react'
import { View, Text, ScrollView, Switch, ActivityIndicator, Linking } from 'react-native'
import * as Calendar from 'expo-calendar'
import Ionicons from '@expo/vector-icons/Ionicons'
import { BackButton } from '@/src/components/ui/BackButton'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'
import { useCalendarStore } from '@/src/stores/calendarStore'
import { useOnAppActive } from '@/src/hooks/useOnAppActive'
import { requestOrOpenSettings } from '@/src/utils/permissions'

export default function CalendarSettingsScreen() {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const bottomPadding = useBottomTabPadding()
  const {
    availableCalendars,
    selectedCalendarIds,
    toggleCalendar,
    syncEvents,
    isSyncing,
    lastSyncedAt,
    hasPermission,
    initialize,
    refreshPermission,
  } = useCalendarStore()

  useEffect(() => {
    void initialize()
  }, [initialize])

  // Sistem ayarlarından dönünce izni iki yönde de yeniden oku.
  useOnAppActive(() => { void refreshPermission() })

  // Kalıcı reddedilmiş izinde diyalog çıkmıyordu, düğme ölü görünüyordu (#13, #15).
  const askPermission = async () => {
    if (await requestOrOpenSettings(Calendar.requestCalendarPermissionsAsync, Linking.openSettings)) {
      void initialize()
    }
  }

  const lastSyncText = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
    : t.acc_not_synced_yet

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={{ padding: spacing[5], paddingBottom: bottomPadding }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[5] }}>
          <BackButton />
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>
            {t.acc_calendar_sync}
          </Text>
        </View>

        {/* Açıklama */}
        <GlassCard style={{ marginBottom: spacing[5] }}>
          <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>
            {t.acc_calendar_desc}
          </Text>
        </GlassCard>

        {/* İzin yoksa */}
        {!hasPermission && (
          <GlassCard style={{ marginBottom: spacing[5] }}>
            <View style={{ alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3] }}>
              <Ionicons name="calendar-outline" size={40} color={colors.textSubtle} />
              <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary, textAlign: 'center' }}>
                {t.acc_calendar_permission_req}
              </Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center' }}>
                {t.acc_calendar_permission_desc}
              </Text>
              <Button label={t.acc_allow} onPress={() => void askPermission()} />
            </View>
          </GlassCard>
        )}

        {/* Takvim listesi */}
        {hasPermission && availableCalendars.length > 0 && (
          <View style={{ gap: spacing[3], marginBottom: spacing[5] }}>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              {t.acc_calendars}
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
                      {(calendar.source as { name?: string } | undefined)?.name ?? t.acc_device}
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
              label={isSyncing ? t.acc_syncing : t.acc_sync_now}
              onPress={() => void syncEvents()}
              variant="secondary"
              fullWidth
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], justifyContent: 'center' }}>
              {isSyncing && <ActivityIndicator size="small" color={palette.accent} />}
              <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
                {t.acc_last_sync}{lastSyncText}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenBackground>
  )
}
