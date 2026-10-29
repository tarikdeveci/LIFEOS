import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { supabase } from '@/src/lib/supabase'
import { useCalendarStore } from '@/src/stores/calendarStore'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { BackButton } from '@/src/components/report/ReportStates'
import { CsvImportSheet } from '@/src/components/workout/CsvImportSheet'
import { IntegrationsLink } from '@/src/components/settings/IntegrationsLink'
import { SupportCard } from '@/src/components/settings/SupportCard'
import { DataSourcesCard } from '@/src/components/settings/DataSourcesCard'
import { useTheme } from '@/src/contexts/ThemeContext'
import type { ThemeMode } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import type { Language } from '@/src/i18n'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

const THEME_OPTIONS_DEF: { mode: ThemeMode; trLabel: string; enLabel: string; icon: string }[] = [
  { mode: 'light',  trLabel: 'Açık',   enLabel: 'Light',  icon: 'sunny-outline' },
  { mode: 'dark',   trLabel: 'Koyu',   enLabel: 'Dark',   icon: 'moon-outline' },
  { mode: 'system', trLabel: 'Sistem', enLabel: 'System', icon: 'phone-portrait-outline' },
]

const LANG_OPTIONS: { lang: Language; label: string; flag: string }[] = [
  { lang: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { lang: 'en', label: 'English', flag: '🇬🇧' },
]

/** Uygulama ayarları; Profil başlığındaki "Ayarlar" düğmesiyle açılır (2026-10-29). */
export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme()
  const { lang, setLang, t } = useLang()
  const { hasPermission: calendarGranted } = useCalendarStore()
  const bottomPadding = useBottomTabPadding()
  const [userId, setUserId] = useState<string | null>(null)
  const [showCsvImport, setShowCsvImport] = useState(false)

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      setUserId(user?.id ?? null)
    }
    void loadUser()
  }, [])

  function goBack() {
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)/profile' as never)
  }

  async function openExternalUrl(url: string) {
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert('Bağlantı açılamadı', 'Lütfen lifeos.tr adresini tarayıcıdan ziyaret et.')
    }
  }

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={{ padding: spacing[5], paddingBottom: bottomPadding }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[5] }}>
          <BackButton onPress={goBack} />
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.settings_title}</Text>
        </View>

        <GroupLabel label={t.settings_group_connections} first />

        <IntegrationsLink />

        {/* Calendar */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <TouchableOpacity onPress={() => router.push('/(tabs)/settings/calendar' as any)} activeOpacity={0.7}>
          <GlassCard style={{ marginBottom: spacing[4] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flex: 1 }}>
                <Ionicons name="calendar-outline" size={18} color={palette.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                    {lang === 'tr' ? 'Takvim Senkronizasyonu' : 'Calendar Sync'}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: calendarGranted ? palette.success : colors.textMuted, marginTop: 2 }}>
                    {calendarGranted ? '✓ Erişim verildi' : 'İzin verilmemiş'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* API ve Otomasyon: web panelinde yönetilir */}
        <TouchableOpacity onPress={() => void openExternalUrl('https://lifeos.tr/settings')} activeOpacity={0.7}>
          <GlassCard style={{ marginBottom: spacing[4] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flex: 1 }}>
                <Ionicons name="key-outline" size={18} color={palette.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                    {lang === 'tr' ? 'API ve Otomasyon' : 'API & Automation'}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                    {lang === 'tr'
                      ? 'Mail ve otomasyonlardan görev almak için anahtarları web panelinden oluştur'
                      : 'Create keys in the web panel to receive tasks from email & automations'}
                  </Text>
                </View>
              </View>
              <Ionicons name="open-outline" size={16} color={colors.textSubtle} />
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* CSV içe aktarma: Strong/Hevy/FitNotes */}
        <TouchableOpacity onPress={() => setShowCsvImport(true)} activeOpacity={0.7}>
          <GlassCard style={{ marginBottom: spacing[4] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flex: 1 }}>
                <Ionicons name="cloud-upload-outline" size={18} color={palette.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                    {lang === 'tr' ? 'Antrenman Verisi İçe Aktar' : 'Import Workout Data'}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                    {lang === 'tr' ? 'Strong, Hevy veya FitNotes CSV dosyası' : 'Strong, Hevy or FitNotes CSV file'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
            </View>
          </GlassCard>
        </TouchableOpacity>

        <GroupLabel label={t.settings_group_app} />

        {/* Bildirimler */}
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <TouchableOpacity onPress={() => router.push('/(tabs)/settings/notifications' as any)} activeOpacity={0.7}>
          <GlassCard style={{ marginBottom: spacing[4] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flex: 1 }}>
                <Ionicons name="notifications-outline" size={18} color={palette.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                    {lang === 'tr' ? 'Bildirimler' : 'Notifications'}
                  </Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                    {lang === 'tr'
                      ? 'Sabah, öğlen ve akşam özetleri, blok hatırlatmaları, e-posta'
                      : 'Morning, midday and evening digests, block reminders, email'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
            </View>
          </GlassCard>
        </TouchableOpacity>

        {/* Language */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[4] }}>Dil / Language</Text>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            {LANG_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.lang}
                onPress={() => setLang(opt.lang)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: spacing[3], borderRadius: radius.lg, backgroundColor: lang === opt.lang ? `${palette.accent}18` : colors.glassInner, borderWidth: 1.5, borderColor: lang === opt.lang ? palette.accent : colors.border }}
              >
                <Text style={{ fontSize: 20 }}>{opt.flag}</Text>
                <Text style={{ fontSize: fontSize.sm, fontWeight: lang === opt.lang ? fontWeight.bold : fontWeight.regular, color: lang === opt.lang ? palette.accent : colors.textMuted }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </GlassCard>

        {/* Theme */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[4] }}>{lang === 'tr' ? 'Tema' : 'Theme'}</Text>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            {THEME_OPTIONS_DEF.map((opt) => (
              <TouchableOpacity
                key={opt.mode}
                onPress={() => setMode(opt.mode)}
                style={{ flex: 1, alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3], borderRadius: radius.lg, backgroundColor: mode === opt.mode ? `${palette.accent}18` : colors.glassInner, borderWidth: 1, borderColor: mode === opt.mode ? palette.accent : colors.border }}
              >
                <Ionicons name={opt.icon as never} size={20} color={mode === opt.mode ? palette.accent : colors.textMuted} />
                <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: mode === opt.mode ? palette.accent : colors.textMuted }}>
                  {lang === 'tr' ? opt.trLabel : opt.enLabel}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </GlassCard>

        <GroupLabel label={t.settings_group_support} />

        {/* Puanla / paylaş / geri bildirim (Play test raporu 2026-09-30) */}
        <SupportCard />

        <GroupLabel label={t.settings_group_about} />

        <DataSourcesCard />
      </ScrollView>

      {userId && (
        <CsvImportSheet visible={showCsvImport} onClose={() => setShowCsvImport(false)} userId={userId} />
      )}
    </ScreenBackground>
  )
}

function GroupLabel({ label, first = false }: { label: string; first?: boolean }) {
  const { colors } = useTheme()
  return (
    <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: first ? 0 : spacing[2], marginBottom: spacing[3] }}>
      {label}
    </Text>
  )
}
