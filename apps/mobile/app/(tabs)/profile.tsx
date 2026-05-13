import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, StyleSheet,
} from 'react-native'
import { router } from 'expo-router'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — @expo/vector-icons is available at runtime via Expo SDK
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/src/lib/supabase'
import {
  connectCalendarProvider,
  disconnectCalendarProvider,
  getCalendarIntegrationState,
  getLocalCalendars,
  importCalendarEventsForDate,
  requestLocalCalendarAccess,
  setCalendarAutoImport,
  setSelectedLocalCalendars,
  type CalendarIntegrationState,
  type CalendarProvider,
  type LocalCalendarSummary,
} from '@/src/lib/calendarIntegration'
import {
  APP_DEFAULTS,
  calculateTDEE,
  suggestMacrosFromTDEE,
  ACTIVITY_LABELS,
  type ActivityLevel,
  type FitnessGoal,
} from '@lifeos/shared'
import { T } from '@/src/theme'
import { useLang } from '@/src/contexts/LangContext'
import { useTheme, type ThemeMode } from '@/src/contexts/ThemeContext'

interface ProfileData {
  display_name: string
  email: string
  timezone: string
}

interface BodyData {
  weight_kg: number
  height_cm: number
  age: number
  gender: 'male' | 'female'
  activity_level: ActivityLevel
  fitness_goal: FitnessGoal
}

interface NutritionTargetData {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

type SectionKey = 'profile' | 'body' | 'nutrition'

// NativeWind v5 preview TextInput className bug workaround: use StyleSheet directly
const inputStyles = StyleSheet.create({
  base: {
    borderWidth: 1,
    borderColor: 'rgba(180, 195, 235, 0.70)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#0D1B3E',
    fontSize: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
  },
  centered: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(180, 195, 235, 0.70)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#0D1B3E',
    fontSize: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
  },
})

export default function ProfileScreen() {
  const { lang, setLang, t } = useLang()
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [calendarBusy, setCalendarBusy] = useState<string | null>(null)
  const [calendarImporting, setCalendarImporting] = useState(false)
  const [activeSection, setActiveSection] = useState<SectionKey>('profile')
  const [userId, setUserId] = useState<string | null>(null)
  const [calendarState, setCalendarState] = useState<CalendarIntegrationState>({
    autoImportEnabled: false,
    selectedLocalCalendarIds: [],
    localPermission: 'undetermined',
    googleConnected: false,
    outlookConnected: false,
  })
  const [localCalendars, setLocalCalendars] = useState<LocalCalendarSummary[]>([])

  const [profile, setProfile] = useState<ProfileData>({
    display_name: '',
    email: '',
    timezone: APP_DEFAULTS.TIMEZONE,
  })

  const [bodyData, setBodyData] = useState<BodyData>({
    weight_kg: 75,
    height_cm: 175,
    age: 25,
    gender: 'male',
    activity_level: 'moderately_active',
    fitness_goal: 'general',
  })

  const [nutritionTarget, setNutritionTarget] = useState<NutritionTargetData>({
    calories: APP_DEFAULTS.DEFAULT_CALORIES,
    protein_g: APP_DEFAULTS.DEFAULT_PROTEIN_G,
    carbs_g: APP_DEFAULTS.DEFAULT_CARBS_G,
    fat_g: APP_DEFAULTS.DEFAULT_FAT_G,
    fiber_g: APP_DEFAULTS.DEFAULT_FIBER_G,
  })

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const [profileRes, targetRes, nextCalendarState] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', user.id).single(),
        supabase.from('nutrition_targets').select('*').eq('user_id', user.id).eq('is_active', true).single(),
        getCalendarIntegrationState(),
      ])

      setCalendarState(nextCalendarState)
      if (nextCalendarState.localPermission === 'granted') {
        setLocalCalendars(await getLocalCalendars())
      }

      if (profileRes.data) {
        const prefs = (profileRes.data.preferences as Record<string, unknown>) ?? {}
        setProfile({
          display_name: profileRes.data.display_name ?? '',
          email: user.email ?? '',
          timezone: profileRes.data.timezone ?? APP_DEFAULTS.TIMEZONE,
        })
        setBodyData({
          weight_kg: (prefs['body_weight_kg'] as number) ?? 75,
          height_cm: (prefs['height_cm'] as number) ?? 175,
          age: (prefs['age'] as number) ?? 25,
          gender: (prefs['gender'] as 'male' | 'female') ?? 'male',
          activity_level: (prefs['activity_level'] as ActivityLevel) ?? 'moderately_active',
          fitness_goal: (prefs['fitness_goal'] as FitnessGoal) ?? 'general',
        })
      } else {
        setProfile((prev) => ({ ...prev, email: user.email ?? '' }))
      }

      if (targetRes.data) {
        const t = targetRes.data
        setNutritionTarget({
          calories: t.calories,
          protein_g: t.protein_g,
          carbs_g: t.carbs_g,
          fat_g: t.fat_g,
          fiber_g: t.fiber_g,
        })
      }

      setLoading(false)
    }
    void loadData()
  }, [])

  const refreshCalendarState = useCallback(async () => {
    const nextState = await getCalendarIntegrationState()
    setCalendarState(nextState)
    setLocalCalendars(nextState.localPermission === 'granted' ? await getLocalCalendars() : [])
  }, [])

  const handleRequestLocalCalendar = useCallback(async () => {
    setCalendarBusy('local')
    try {
      const nextState = await requestLocalCalendarAccess()
      setCalendarState(nextState)
      setLocalCalendars(nextState.localPermission === 'granted' ? await getLocalCalendars() : [])
    } catch {
      Alert.alert('Hata', 'Yerel takvim izni alınamadı')
    } finally {
      setCalendarBusy(null)
    }
  }, [])

  const handleToggleLocalCalendar = useCallback(async (calendarId: string) => {
    setCalendarBusy(calendarId)
    try {
      const nextIds = calendarState.selectedLocalCalendarIds.includes(calendarId)
        ? calendarState.selectedLocalCalendarIds.filter((id) => id !== calendarId)
        : [...calendarState.selectedLocalCalendarIds, calendarId]
      const nextState = await setSelectedLocalCalendars(nextIds)
      setCalendarState(nextState)
      setLocalCalendars(await getLocalCalendars())
    } catch {
      Alert.alert('Hata', 'Takvim seçimi güncellenemedi')
    } finally {
      setCalendarBusy(null)
    }
  }, [calendarState.selectedLocalCalendarIds])

  const handleProviderConnect = useCallback(async (provider: CalendarProvider) => {
    setCalendarBusy(provider)
    try {
      const nextState = await connectCalendarProvider(provider)
      setCalendarState(nextState)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Bağlantı kurulamadı'
      Alert.alert('Bağlantı Hatası', message)
    } finally {
      setCalendarBusy(null)
    }
  }, [])

  const handleProviderDisconnect = useCallback(async (provider: CalendarProvider) => {
    setCalendarBusy(`${provider}-disconnect`)
    try {
      setCalendarState(await disconnectCalendarProvider(provider))
    } catch {
      Alert.alert('Hata', 'Bağlantı kaldırılamadı')
    } finally {
      setCalendarBusy(null)
    }
  }, [])

  const handleImportToday = useCallback(async () => {
    if (!userId || calendarImporting) return
    const today = new Date().toISOString().slice(0, 10)
    setCalendarImporting(true)
    try {
      const { imported, skipped } = await importCalendarEventsForDate(supabase, userId, today)
      if (imported === 0) {
        Alert.alert('Bilgi', skipped > 0 ? 'Etkinlikler mevcut bloklarla çakıştı, eklenmedi' : 'Bugün için içe aktarılacak etkinlik yok')
      } else {
        Alert.alert('Tamam', skipped > 0 ? `${imported} etkinlik eklendi, ${skipped} atlandı` : `${imported} etkinlik bugüne eklendi`)
      }
    } catch (error) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'İçe aktarma başarısız')
    } finally {
      setCalendarImporting(false)
    }
  }, [calendarImporting, userId])

  const handleToggleAutoImport = useCallback(async () => {
    setCalendarBusy('auto-import')
    try {
      setCalendarState(await setCalendarAutoImport(!calendarState.autoImportEnabled))
    } catch {
      Alert.alert('Hata', 'Otomatik içe aktarma güncellenemedi')
    } finally {
      setCalendarBusy(null)
    }
  }, [calendarState.autoImportEnabled])

  const handleSaveProfile = useCallback(async () => {
    if (!userId) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ display_name: profile.display_name, timezone: profile.timezone })
        .eq('id', userId)

      if (error) throw error
      Alert.alert('Başarılı', 'Profil kaydedildi')
    } catch {
      Alert.alert('Hata', 'Profil kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }, [userId, profile])

  const handleSaveBody = useCallback(async () => {
    if (!userId) return
    setSaving(true)
    try {
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('preferences')
        .eq('id', userId)
        .single()

      const existingPrefs = (profileData?.preferences as Record<string, unknown>) ?? {}

      const { error } = await supabase
        .from('user_profiles')
        .update({
          preferences: {
            ...existingPrefs,
            body_weight_kg: bodyData.weight_kg,
            height_cm: bodyData.height_cm,
            age: bodyData.age,
            gender: bodyData.gender,
            activity_level: bodyData.activity_level,
            fitness_goal: bodyData.fitness_goal,
          },
        })
        .eq('id', userId)

      if (error) throw error
      Alert.alert('Başarılı', 'Vücut bilgileri kaydedildi')
    } catch {
      Alert.alert('Hata', 'Vücut bilgileri kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }, [userId, bodyData])

  const handleApplyTDEE = useCallback(() => {
    const tdee = calculateTDEE({
      weight_kg: bodyData.weight_kg,
      height_cm: bodyData.height_cm,
      age: bodyData.age,
      gender: bodyData.gender,
      activity_level: bodyData.activity_level,
    })
    const suggested = suggestMacrosFromTDEE(tdee, bodyData.fitness_goal)
    setNutritionTarget(suggested)
    setActiveSection('nutrition')
    Alert.alert('Hedefler Güncellendi', `TDEE: ${tdee} kcal\nHedef: ${suggested.calories} kcal`)
  }, [bodyData])

  const handleSaveNutrition = useCallback(async () => {
    if (!userId) return
    setSaving(true)
    try {
      await supabase
        .from('nutrition_targets')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true)

      const { error } = await supabase.from('nutrition_targets').insert({
        user_id: userId,
        ...nutritionTarget,
        is_active: true,
      })

      if (error) throw error
      Alert.alert('Başarılı', 'Beslenme hedefleri kaydedildi')
    } catch {
      Alert.alert('Hata', 'Hedefler kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }, [userId, nutritionTarget])

  const handleLogout = useCallback(() => {
    Alert.alert(t.profile_logout, t.profile_logout_confirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.profile_logout, style: 'destructive',
        onPress: () => {
          void supabase.auth.signOut().then(() => router.replace('/(auth)/login'))
        },
      },
    ])
  }, [t])

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator size="large" color={T.accent} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 16, paddingTop: 56 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(15,23,42,0.08)' }}
          >
            <Ionicons name="chevron-back" size={20} color={T.text.secondary} />
          </TouchableOpacity>
          <Text style={{ fontSize: 28, fontWeight: '800', color: T.text.primary, letterSpacing: -0.5 }}>Profil & Ayarlar</Text>
          <View style={{ width: 40, height: 40 }} />
        </View>

        {/* Tabs */}
        <View className="mt-3 flex-row rounded-xl bg-gray-100 p-1">
          {([
            { key: 'profile' as SectionKey, label: t.profile_tab_profile },
            { key: 'body' as SectionKey, label: t.profile_tab_body },
            { key: 'nutrition' as SectionKey, label: t.profile_tab_nutrition },
          ]).map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveSection(tab.key)}
              className={`flex-1 items-center rounded-lg py-1.5 ${activeSection === tab.key ? 'bg-white' : ''}`}
            >
              <Text className={`text-xs font-medium ${activeSection === tab.key ? 'text-primary' : 'text-muted'}`}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>

        {/* ── PROFIL ── */}
        {activeSection === 'profile' && (
          <>
            <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
              <Text className="mb-1 text-xs text-muted">E-posta</Text>
              <Text className="text-primary">{profile.email}</Text>
            </View>

            <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
              <Text className="mb-2 text-sm font-medium text-primary">Ad Soyad</Text>
              <TextInput
                value={profile.display_name}
                onChangeText={(v) => setProfile({ ...profile, display_name: v })}
                placeholder="Adınızı girin"
                placeholderTextColor="#9CA3AF"
                style={inputStyles.base}
              />
            </View>

            <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
              <Text className="mb-1 text-sm font-medium text-primary">Zaman Dilimi</Text>
              <Text className="text-muted">{profile.timezone}</Text>
              <Text className="mt-1 text-xs text-muted">Şu an sadece Europe/Istanbul desteklenmektedir</Text>
            </View>

            <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Text className="text-sm font-medium text-primary">Takvim Entegrasyonları</Text>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => void handleImportToday()}
                    disabled={calendarImporting}
                    style={{ opacity: calendarImporting ? 0.5 : 1 }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: T.text.accent }}>
                      {calendarImporting ? 'Aktarılıyor...' : 'Bugün İçe Aktar'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void refreshCalendarState()}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: T.text.muted }}>Yenile</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => void handleToggleAutoImport()}
                disabled={calendarBusy === 'auto-import'}
                style={{
                  marginBottom: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: 'rgba(15,23,42,0.08)',
                  backgroundColor: 'rgba(255,255,255,0.82)',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  opacity: calendarBusy === 'auto-import' ? 0.5 : 1,
                }}
              >
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: T.text.primary }}>Planlamada otomatik içe aktar</Text>
                  <Text style={{ marginTop: 2, fontSize: 11, color: T.text.muted }}>Seçili gün açıldığında bağlı takvimlerden etkinlikleri çek.</Text>
                </View>
                <Text style={{ fontSize: 12, fontWeight: '800', color: calendarState.autoImportEnabled ? T.text.success : T.text.muted }}>
                  {calendarState.autoImportEnabled ? 'Açık' : 'Kapalı'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => void handleRequestLocalCalendar()}
                disabled={calendarBusy === 'local'}
                style={{
                  marginBottom: 10,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: calendarState.localPermission === 'granted' ? 'rgba(16,185,129,0.25)' : 'rgba(15,23,42,0.08)',
                  backgroundColor: calendarState.localPermission === 'granted' ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.82)',
                  padding: 12,
                  opacity: calendarBusy === 'local' ? 0.5 : 1,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: T.text.primary }}>Yerel Takvim Uygulaması</Text>
                    <Text style={{ marginTop: 2, fontSize: 11, color: T.text.muted }}>
                      {calendarState.localPermission === 'granted' ? 'Bağlı ve okunabilir' : 'İzin vererek cihaz takvimlerini bağla'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: calendarState.localPermission === 'granted' ? T.text.success : T.text.muted }}>
                    {calendarState.localPermission === 'granted' ? 'Bağlı' : 'Bağla'}
                  </Text>
                </View>
              </TouchableOpacity>

              {calendarState.localPermission === 'granted' && localCalendars.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  {localCalendars.map((calendar) => (
                    <TouchableOpacity
                      key={calendar.id}
                      onPress={() => void handleToggleLocalCalendar(calendar.id)}
                      disabled={calendarBusy === calendar.id}
                      style={{
                        marginBottom: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: calendar.selected ? 'rgba(99,102,241,0.24)' : 'rgba(15,23,42,0.08)',
                        backgroundColor: calendar.selected ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.82)',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        opacity: calendarBusy === calendar.id ? 0.5 : 1,
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: T.text.primary }}>{calendar.title}</Text>
                        <Text style={{ marginTop: 2, fontSize: 10, color: T.text.muted }}>{calendar.source}</Text>
                      </View>
                      <Text style={{ fontSize: 12 }}>{calendar.selected ? '\u2713' : '\u25a1'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {([
                { key: 'google' as const, label: 'Google Calendar', connected: calendarState.googleConnected },
                { key: 'outlook' as const, label: 'Outlook Calendar', connected: calendarState.outlookConnected },
              ]).map((provider) => {
                const busyKey = provider.connected ? `${provider.key}-disconnect` : provider.key
                return (
                  <TouchableOpacity
                    key={provider.key}
                    onPress={() => void (provider.connected ? handleProviderDisconnect(provider.key) : handleProviderConnect(provider.key))}
                    disabled={calendarBusy === busyKey}
                    style={{
                      marginBottom: 8,
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: provider.connected ? 'rgba(16,185,129,0.25)' : 'rgba(15,23,42,0.08)',
                      backgroundColor: provider.connected ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.82)',
                      padding: 12,
                      opacity: calendarBusy === busyKey ? 0.5 : 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: T.text.primary }}>{provider.label}</Text>
                        <Text style={{ marginTop: 2, fontSize: 11, color: T.text.muted }}>
                          {provider.connected ? 'OAuth bağlantısı aktif' : 'PKCE ile bağlanıp etkinlikleri oku'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: provider.connected ? T.text.success : T.text.muted }}>
                        {provider.connected ? 'Bağlı' : 'Bağla'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              })}

              <Text style={{ marginTop: 4, fontSize: 10, color: T.text.muted }}>
                Google ve Outlook için ilgili OAuth client id env değerleri tanımlı olmalı.
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => void handleSaveProfile()}
              disabled={saving}
              className="mb-8 items-center rounded-xl bg-accent py-3"
              style={{ opacity: saving ? 0.5 : 1 }}
            >
              {saving ? <ActivityIndicator size="small" color="white" /> : <Text className="font-semibold text-white">{t.profile_save}</Text>}
            </TouchableOpacity>

            {/* Dil / Language */}
            <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
              <Text className="mb-1 text-sm font-semibold text-primary">{t.profile_lang}</Text>
              <Text className="mb-3 text-xs text-muted">{t.profile_lang_desc}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['en', 'tr'] as const).map((l) => (
                  <TouchableOpacity
                    key={l}
                    onPress={() => setLang(l)}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                      backgroundColor: lang === l ? T.accent : 'rgba(99,102,241,0.08)',
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: lang === l ? '#fff' : T.text.accent }}>
                      {l === 'en' ? '🇬🇧 English' : '🇹🇷 Türkçe'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Tema / Theme */}
            <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
              <Text className="mb-1 text-sm font-semibold text-primary">{t.profile_theme}</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                {([
                  { value: 'light' as ThemeMode, label: t.profile_theme_light, icon: '☀️' },
                  { value: 'dark' as ThemeMode, label: t.profile_theme_dark, icon: '🌙' },
                  { value: 'system' as ThemeMode, label: t.profile_theme_system, icon: '📱' },
                ]).map(({ value, label, icon }) => (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setThemeMode(value)}
                    style={{
                      flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                      backgroundColor: themeMode === value ? T.accent : 'rgba(99,102,241,0.08)',
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>{icon}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: themeMode === value ? '#fff' : T.text.accent, marginTop: 2 }}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity onPress={handleLogout} className="mb-8 items-center rounded-xl border border-danger py-3">
              <Text className="font-semibold text-danger">{t.profile_logout}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── VÜCUT ── */}
        {activeSection === 'body' && (
          <>
            <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
              <Text className="mb-3 font-semibold text-primary">Vucut Bilgileri</Text>

              <Text className="mb-1 text-sm text-primary">Cinsiyet</Text>
              <View className="mb-3 flex-row gap-2">
                {([['male', '♂ Erkek'], ['female', '♀ Kadın']] as const).map(([val, label]) => (
                  <TouchableOpacity
                    key={val}
                    onPress={() => setBodyData({ ...bodyData, gender: val })}
                    className={`flex-1 items-center rounded-xl border py-2 ${bodyData.gender === val ? 'border-accent bg-accent/10' : 'border-gray-200'}`}
                  >
                    <Text className={`text-sm font-medium ${bodyData.gender === val ? 'text-accent' : 'text-muted'}`}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View className="mb-3 flex-row gap-3">
                <View className="flex-1">
                  <Text className="mb-1 text-sm text-primary">Agirlik (kg)</Text>
                  <TextInput
                    value={String(bodyData.weight_kg)}
                    onChangeText={(v) => { const n = parseInt(v); if (!isNaN(n)) setBodyData({ ...bodyData, weight_kg: n }) }}
                    keyboardType="numeric"
                    style={inputStyles.base}
                  />
                </View>
                <View className="flex-1">
                  <Text className="mb-1 text-sm text-primary">Boy (cm)</Text>
                  <TextInput
                    value={String(bodyData.height_cm)}
                    onChangeText={(v) => { const n = parseInt(v); if (!isNaN(n)) setBodyData({ ...bodyData, height_cm: n }) }}
                    keyboardType="numeric"
                    style={inputStyles.base}
                  />
                </View>
              </View>

              <Text className="mb-1 text-sm text-primary">Yas</Text>
              <TextInput
                value={String(bodyData.age)}
                onChangeText={(v) => { const n = parseInt(v); if (!isNaN(n)) setBodyData({ ...bodyData, age: n }) }}
                keyboardType="numeric"
                style={inputStyles.base}
              />
            </View>

            <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
              <Text className="mb-3 font-semibold text-primary">Haftalik Aktivite</Text>
              {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  onPress={() => setBodyData({ ...bodyData, activity_level: val })}
                  className={`mb-2 flex-row items-center rounded-xl border px-3 py-2.5 ${bodyData.activity_level === val ? 'border-accent bg-accent/10' : 'border-gray-200'}`}
                >
                  <View className={`mr-3 h-4 w-4 rounded-full border-2 ${bodyData.activity_level === val ? 'border-accent bg-accent' : 'border-gray-300'}`} />
                  <Text className={`text-sm ${bodyData.activity_level === val ? 'font-medium text-accent' : 'text-primary'}`}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
              <Text className="mb-3 font-semibold text-primary">Fitness Hedefiniz</Text>
              {([['general', 'Genel Fitness'], ['muscle_gain', 'Kas Kutlesi'], ['fat_loss', 'Yag Yakma']] as const).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  onPress={() => setBodyData({ ...bodyData, fitness_goal: val })}
                  className={`mb-2 flex-row items-center rounded-xl border px-3 py-2.5 ${bodyData.fitness_goal === val ? 'border-accent bg-accent/10' : 'border-gray-200'}`}
                >
                  <View className={`mr-3 h-4 w-4 rounded-full border-2 ${bodyData.fitness_goal === val ? 'border-accent bg-accent' : 'border-gray-300'}`} />
                  <Text className={`text-sm ${bodyData.fitness_goal === val ? 'font-medium text-accent' : 'text-primary'}`}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* TDEE Özeti */}
            {(() => {
              const tdee = calculateTDEE({ weight_kg: bodyData.weight_kg, height_cm: bodyData.height_cm, age: bodyData.age, gender: bodyData.gender, activity_level: bodyData.activity_level })
              return (
                <View className="mb-4 rounded-2xl border border-accent/20 bg-accent/5 p-4">
                  <Text className="mb-1 text-sm font-semibold text-accent">Hesaplanan TDEE</Text>
                  <Text className="text-2xl font-bold text-accent">{tdee} kcal/gün</Text>
                  <Text className="mt-1 text-xs text-muted">Harris-Benedict formülü</Text>
                  <TouchableOpacity onPress={handleApplyTDEE} className="mt-3 items-center rounded-xl bg-accent py-2">
                    <Text className="text-sm font-semibold text-white">Beslenme Hedeflerine Uygula →</Text>
                  </TouchableOpacity>
                </View>
              )
            })()}

            <TouchableOpacity
              onPress={() => void handleSaveBody()}
              disabled={saving}
              className="mb-8 items-center rounded-xl bg-accent py-3"
              style={{ opacity: saving ? 0.5 : 1 }}
            >
              {saving ? <ActivityIndicator size="small" color="white" /> : <Text className="font-semibold text-white">Vücut Bilgilerini Kaydet</Text>}
            </TouchableOpacity>
          </>
        )}

        {/* ── BESLENME ── */}
        {activeSection === 'nutrition' && (
          <>
            <View className="mb-4 rounded-2xl border border-gray-100 bg-surface p-4">
              <Text className="mb-1 font-semibold text-primary">Günlük Makro Hedefleri</Text>
              <Text className="mb-4 text-xs text-muted">Vücut sekmesinden TDEE ile otomatik hesaplayabilirsin.</Text>

              {([
                { key: 'calories' as const, label: 'Kalori', unit: 'kcal', min: 500, max: 5000, step: 50 },
                { key: 'protein_g' as const, label: 'Protein', unit: 'g', min: 0, max: 400, step: 5 },
                { key: 'carbs_g' as const, label: 'Karbonhidrat', unit: 'g', min: 0, max: 600, step: 5 },
                { key: 'fat_g' as const, label: 'Yag', unit: 'g', min: 0, max: 200, step: 5 },
                { key: 'fiber_g' as const, label: '🥦 Lif', unit: 'g', min: 0, max: 80, step: 2 },
              ]).map((field) => (
                <View key={field.key} className="mb-3">
                  <View className="mb-1 flex-row justify-between">
                    <Text className="text-sm text-primary">{field.label}</Text>
                    <Text className="text-sm font-semibold text-accent">{nutritionTarget[field.key]} {field.unit}</Text>
                  </View>
                  <View className="flex-row gap-2">
                    <TouchableOpacity
                      onPress={() => setNutritionTarget((prev) => ({ ...prev, [field.key]: Math.max(field.min, prev[field.key] - field.step) }))}
                      className="h-10 w-10 items-center justify-center rounded-xl border border-gray-200"
                    >
                      <Text className="text-lg font-bold text-muted">−</Text>
                    </TouchableOpacity>
                    <TextInput
                      value={String(nutritionTarget[field.key])}
                      onChangeText={(v) => { const n = parseInt(v); if (!isNaN(n)) setNutritionTarget((prev) => ({ ...prev, [field.key]: n })) }}
                      keyboardType="numeric"
                      style={inputStyles.centered}
                    />
                    <TouchableOpacity
                      onPress={() => setNutritionTarget((prev) => ({ ...prev, [field.key]: Math.min(field.max, prev[field.key] + field.step) }))}
                      className="h-10 w-10 items-center justify-center rounded-xl bg-accent"
                    >
                      <Text className="text-lg font-bold text-white">+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity
              onPress={() => void handleSaveNutrition()}
              disabled={saving}
              className="mb-8 items-center rounded-xl bg-accent py-3"
              style={{ opacity: saving ? 0.5 : 1 }}
            >
              {saving ? <ActivityIndicator size="small" color="white" /> : <Text className="font-semibold text-white">Hedefleri Kaydet</Text>}
            </TouchableOpacity>
          </>
        )}

      </ScrollView>
    </View>
  )
}
