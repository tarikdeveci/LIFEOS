import { useEffect, useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import { calculateTDEE, suggestMacrosFromTDEE } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { useCalendarStore } from '@/src/stores/calendarStore'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { useSubscriptionStatus } from '@/src/contexts/SubscriptionContext'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Input } from '@/src/components/ui/Input'
import { Button } from '@/src/components/ui/Button'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import type { ThemeMode } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import type { Language } from '@/src/i18n'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

const ACTIVITY_LEVELS_DEF = [
  { key: 'sedentary',          trLabel: 'Hareketsiz',  enLabel: 'Sedentary',      trSub: 'Masabaşı, spor yok',       enSub: 'Desk job, no exercise' },
  { key: 'lightly_active',     trLabel: 'Az Aktif',    enLabel: 'Lightly Active', trSub: 'Haftada 1-3 gün spor',    enSub: '1-3 days/week' },
  { key: 'moderately_active',  trLabel: 'Orta Aktif',  enLabel: 'Moderately Active', trSub: 'Haftada 3-5 gün spor', enSub: '3-5 days/week' },
  { key: 'very_active',        trLabel: 'Çok Aktif',   enLabel: 'Very Active',    trSub: 'Haftada 6-7 gün spor',    enSub: '6-7 days/week' },
]

const FITNESS_GOALS_DEF = [
  { key: 'weight_loss',  trLabel: 'Kilo Vermek',  enLabel: 'Weight Loss',  icon: 'trending-down-outline' },
  { key: 'muscle_gain',  trLabel: 'Kas Kazanmak', enLabel: 'Muscle Gain',  icon: 'barbell-outline' },
  { key: 'maintenance',  trLabel: 'Kilo Korumak', enLabel: 'Maintenance',  icon: 'fitness-outline' },
  { key: 'endurance',    trLabel: 'Dayanıklılık', enLabel: 'Endurance',    icon: 'timer-outline' },
]

const THEME_OPTIONS_DEF: { mode: ThemeMode; trLabel: string; enLabel: string; icon: string }[] = [
  { mode: 'light',  trLabel: 'Açık',   enLabel: 'Light',  icon: 'sunny-outline' },
  { mode: 'dark',   trLabel: 'Koyu',   enLabel: 'Dark',   icon: 'moon-outline' },
  { mode: 'system', trLabel: 'Sistem', enLabel: 'System', icon: 'phone-portrait-outline' },
]

const LANG_OPTIONS: { lang: Language; label: string; flag: string }[] = [
  { lang: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { lang: 'en', label: 'English', flag: '🇬🇧' },
]

interface ProfileState {
  displayName: string; email: string
  height: string; weight: string; age: string
  gender: 'male' | 'female'
  fitnessGoal: string; activityLevel: string
}

interface NutritionState {
  calories: string; protein: string; carbs: string; fat: string; fiber: string
}

export default function ProfileScreen() {
  const { colors, mode, setMode } = useTheme()
  const { lang, setLang, t } = useLang()
  const { hasPermission: calendarGranted } = useCalendarStore()
  const bottomPadding = useBottomTabPadding()

  const ACTIVITY_LEVELS = ACTIVITY_LEVELS_DEF.map((a) => ({
    key: a.key,
    label: lang === 'tr' ? a.trLabel : a.enLabel,
    sub:   lang === 'tr' ? a.trSub   : a.enSub,
  }))

  const FITNESS_GOALS = FITNESS_GOALS_DEF.map((g) => ({
    key:   g.key,
    label: lang === 'tr' ? g.trLabel : g.enLabel,
    icon:  g.icon,
  }))

  const [profile, setProfile] = useState<ProfileState>({
    displayName: '', email: '', height: '', weight: '', age: '',
    gender: 'male',
    fitnessGoal: 'muscle_gain', activityLevel: 'moderately_active',
  })
  const [nutrition, setNutrition] = useState<NutritionState>({
    calories: '', protein: '', carbs: '', fat: '', fiber: '',
  })
  const [userId, setUserId] = useState<string | null>(null)
  const subscription = useSubscriptionStatus()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showPhysical, setShowPhysical] = useState(false)
  const [showNutrition, setShowNutrition] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    setProfile((p) => ({
      ...p,
      displayName: String(user.user_metadata?.display_name ?? ''),
      email: user.email ?? '',
    }))

    // maybeSingle() returns null instead of error when no row found
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('preferences')
      .eq('id', user.id)
      .maybeSingle()

    if (profileData?.preferences) {
      const p = profileData.preferences as Record<string, unknown>
      setProfile((prev) => ({
        ...prev,
        height:        p['height_cm']      != null ? String(p['height_cm'])      : '',
        weight:        p['body_weight_kg'] != null ? String(p['body_weight_kg']) : (p['weight_kg'] != null ? String(p['weight_kg']) : ''),
        age:           p['age']            != null ? String(p['age'])            : '',
        gender:        p['gender'] === 'female' ? 'female' : 'male',
        fitnessGoal:   p['fitness_goal']   != null ? String(p['fitness_goal'])   : 'muscle_gain',
        activityLevel: p['activity_level'] != null ? String(p['activity_level']) : 'moderately_active',
      }))
    }

    const { data: targetData } = await supabase
      .from('nutrition_targets')
      .select('calories, protein_g, carbs_g, fat_g, fiber_g')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (targetData) {
      setNutrition({
        calories: targetData.calories  != null ? String(targetData.calories)  : '',
        protein:  targetData.protein_g != null ? String(targetData.protein_g) : '',
        carbs:    targetData.carbs_g   != null ? String(targetData.carbs_g)   : '',
        fat:      targetData.fat_g     != null ? String(targetData.fat_g)     : '',
        fiber:    targetData.fiber_g   != null ? String(targetData.fiber_g)   : '',
      })
    }

  }, [])

  useEffect(() => { void load() }, [load])

  async function savePhysical() {
    if (!userId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('user_profiles').upsert({
        id: userId,
        preferences: {
          height_cm:      parseFloat(profile.height)  || null,
          body_weight_kg: parseFloat(profile.weight)  || null,
          age:            parseInt(profile.age)        || null,
          gender:         profile.gender,
          fitness_goal:   profile.fitnessGoal,
          activity_level: profile.activityLevel,
        },
      }, { onConflict: 'id' })
      if (error) throw error
      setShowPhysical(false)
      Alert.alert('Kaydedildi', 'Fiziksel bilgilerin güncellendi.')
    } catch (e) {
      Alert.alert('Hata', 'Profil kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  async function saveNutrition() {
    if (!userId) return
    setSaving(true)
    try {
      const payload = {
        calories:  parseFloat(nutrition.calories) || 2000,
        protein_g: parseFloat(nutrition.protein)  || 150,
        carbs_g:   parseFloat(nutrition.carbs)    || 250,
        fat_g:     parseFloat(nutrition.fat)      || 70,
        fiber_g:   parseFloat(nutrition.fiber)    || 30,
        is_active: true,
      }
      const { data: existing } = await supabase
        .from('nutrition_targets')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle()

      const { error } = existing?.id
        ? await supabase.from('nutrition_targets').update(payload).eq('id', existing.id)
        : await supabase.from('nutrition_targets').insert({ user_id: userId, ...payload })

      if (error) throw error
      setShowNutrition(false)
      Alert.alert('Kaydedildi', 'Beslenme hedeflerin güncellendi.')
    } catch {
      Alert.alert('Hata', 'Hedefler kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  function calculateNutritionTargets() {
    const height = parseFloat(profile.height)
    const weight = parseFloat(profile.weight)
    const age = parseInt(profile.age, 10)

    if (!Number.isFinite(height) || !Number.isFinite(weight) || !Number.isFinite(age) || height <= 0 || weight <= 0 || age <= 0) {
      Alert.alert('Eksik bilgi', 'Kalori hesaplamak icin boy, kilo ve yas bilgilerini doldur.')
      return
    }

    const activityLevel =
      profile.activityLevel === 'sedentary' ||
      profile.activityLevel === 'lightly_active' ||
      profile.activityLevel === 'moderately_active' ||
      profile.activityLevel === 'very_active'
        ? profile.activityLevel
        : 'moderately_active'

    const goal =
      profile.fitnessGoal === 'weight_loss'
        ? 'fat_loss'
        : profile.fitnessGoal === 'muscle_gain'
          ? 'muscle_gain'
          : 'general'

    const tdee = calculateTDEE({
      weight_kg: weight,
      height_cm: height,
      age,
      gender: profile.gender,
      activity_level: activityLevel,
    })
    const suggested = suggestMacrosFromTDEE(tdee, goal)

    setNutrition({
      calories: String(suggested.calories),
      protein: String(suggested.protein_g),
      carbs: String(suggested.carbs_g),
      fat: String(suggested.fat_g),
      fiber: String(suggested.fiber_g),
    })
  }

  function handleSignOut() {
    Alert.alert('Çıkış', 'Oturumu kapatmak istediğine emin misin?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  async function openExternalUrl(url: string) {
    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert('Bağlantı açılamadı', 'Lütfen lifeos.tr adresini tarayıcıdan ziyaret et.')
    }
  }

  async function deleteAccount() {
    setDeleting(true)
    try {
      const { error } = await supabase.functions.invoke('delete-account', { body: {} })
      if (error) throw error
      await supabase.auth.signOut()
      Alert.alert(lang === 'tr' ? 'Hesap silindi' : 'Account deleted', lang === 'tr' ? 'Hesabın ve ilişkili verilerin kalıcı olarak silindi.' : 'Your account and associated data were permanently deleted.')
    } catch (error: unknown) {
      Alert.alert(lang === 'tr' ? 'Hesap silinemedi' : 'Could not delete account', error instanceof Error ? error.message : (lang === 'tr' ? 'Lütfen daha sonra tekrar dene.' : 'Please try again later.'))
    } finally {
      setDeleting(false)
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      lang === 'tr' ? 'Hesabı kalıcı olarak sil' : 'Permanently delete account',
      lang === 'tr' ? 'Görevlerin, planların, beslenme kayıtların ve profilin kalıcı olarak silinecek. Bu işlem geri alınamaz.' : 'Your tasks, plans, nutrition records, and profile will be permanently deleted. This cannot be undone.',
      [
        { text: lang === 'tr' ? 'Vazgeç' : 'Cancel', style: 'cancel' },
        { text: lang === 'tr' ? 'Hesabı Sil' : 'Delete Account', style: 'destructive', onPress: () => {
          Alert.alert(lang === 'tr' ? 'Son onay' : 'Final confirmation', lang === 'tr' ? 'Hesabını ve tüm verilerini şimdi silelim mi?' : 'Delete your account and all data now?', [
            { text: lang === 'tr' ? 'Hayır' : 'No', style: 'cancel' },
            { text: lang === 'tr' ? 'Evet, kalıcı sil' : 'Yes, delete permanently', style: 'destructive', onPress: () => void deleteAccount() },
          ])
        } },
      ],
    )
  }

  const initials = profile.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  const hasNutrition = !!(nutrition.calories || nutrition.protein)
  const membershipTitle = lang === 'tr' ? 'Uyelik Durumu' : 'Membership'
  const membershipSubtitle = subscription.isLoading
    ? (lang === 'tr' ? 'Kontrol ediliyor' : 'Checking status')
    : subscription.isPro
      ? (lang === 'tr' ? 'Pro ozellikler aktif' : 'Pro features active')
      : (lang === 'tr' ? 'Ucretsiz plan' : 'Free plan')

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={{ padding: spacing[5], paddingBottom: bottomPadding }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing[6] }}>
          {t.profile_title}
        </Text>

        {/* User card */}
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: `${palette.accent}18`, borderWidth: 1.5, borderColor: `${palette.accent}35`, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: palette.accent }}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{profile.displayName || 'Kullanıcı'}</Text>
              <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>{profile.email}</Text>
            </View>
          </View>
        </GlassCard>

        <GlassCard style={{ marginBottom: spacing[4] }}>
          <TouchableOpacity
            onPress={() => router.push('/paywall')}
            activeOpacity={0.75}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                {membershipTitle}
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
                {subscription.isPro ? membershipSubtitle : (lang === 'tr' ? 'Pro planları incele' : 'See Pro plans')}
              </Text>
            </View>
            <View style={{ paddingHorizontal: spacing[3], paddingVertical: 8, borderRadius: radius.full, backgroundColor: subscription.isPro ? `${palette.success}18` : colors.glassInner, borderWidth: 1, borderColor: subscription.isPro ? `${palette.success}35` : colors.border }}>
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: subscription.isPro ? palette.success : colors.textMuted }}>
                {subscription.isPro ? 'PRO' : 'FREE'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
          </TouchableOpacity>
        </GlassCard>

        {/* Physical info */}
        <SectionCard title={lang === 'tr' ? 'Fiziksel Bilgiler' : 'Physical Info'} icon="body-outline" onEdit={() => setShowPhysical(true)} style={{ marginBottom: spacing[4] }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <InfoChip label="Boy" value={profile.height ? `${profile.height} cm` : '—'} />
            <InfoChip label="Kilo" value={profile.weight ? `${profile.weight} kg` : '—'} />
            <InfoChip label="Yaş" value={profile.age || '—'} />
            <InfoChip label="Cinsiyet" value={profile.gender === 'female' ? 'Kadin' : 'Erkek'} />
            <InfoChip label="Hedef" value={FITNESS_GOALS.find((g) => g.key === profile.fitnessGoal)?.label ?? '—'} />
            <InfoChip label="Aktivite" value={ACTIVITY_LEVELS.find((a) => a.key === profile.activityLevel)?.label ?? '—'} />
          </View>
        </SectionCard>

        {/* Nutrition targets */}
        <SectionCard title={lang === 'tr' ? 'Beslenme Hedefleri' : 'Nutrition Goals'} icon="nutrition-outline" onEdit={() => setShowNutrition(true)} style={{ marginBottom: spacing[4] }}>
          {hasNutrition ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
              <InfoChip label="Kalori" value={nutrition.calories ? `${nutrition.calories} kcal` : '—'} color={palette.warning} />
              <InfoChip label="Protein" value={nutrition.protein ? `${nutrition.protein}g` : '—'} color={palette.info} />
              <InfoChip label="Karb" value={nutrition.carbs ? `${nutrition.carbs}g` : '—'} color={palette.success} />
              <InfoChip label="Yağ" value={nutrition.fat ? `${nutrition.fat}g` : '—'} color={palette.danger} />
              <InfoChip label="Lif" value={nutrition.fiber ? `${nutrition.fiber}g` : '—'} color="#10B981" />
            </View>
          ) : (
            <Text style={{ fontSize: fontSize.sm, color: colors.textSubtle }}>Henüz hedef belirlenmemiş.</Text>
          )}
        </SectionCard>

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
        <GlassCard style={{ marginBottom: spacing[6] }}>
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

        <GlassCard style={{ marginBottom: spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[3] }}>
            <Ionicons name="shield-checkmark-outline" size={19} color={palette.accent} />
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
              {lang === 'tr' ? 'Hesap ve Gizlilik' : 'Account & Privacy'}
            </Text>
          </View>
          <TouchableOpacity onPress={() => void openExternalUrl('https://lifeos.tr/gizlilik-kvkk')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{lang === 'tr' ? 'Gizlilik Politikası ve KVKK' : 'Privacy Policy'}</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{lang === 'tr' ? 'Verilerinin nasıl işlendiğini incele' : 'See how your data is handled'}</Text>
            </View>
            <Ionicons name="open-outline" size={17} color={colors.textMuted} />
          </TouchableOpacity>
          <View style={{ height: 1, backgroundColor: colors.border }} />
          <TouchableOpacity onPress={handleDeleteAccount} disabled={deleting} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.danger }}>{deleting ? (lang === 'tr' ? 'Hesap siliniyor...' : 'Deleting account...') : (lang === 'tr' ? 'Hesabı kalıcı olarak sil' : 'Permanently delete account')}</Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{lang === 'tr' ? 'Tüm LifeOS verilerini geri alınamaz biçimde siler' : 'Permanently removes all LifeOS data'}</Text>
            </View>
            <Ionicons name="trash-outline" size={17} color={palette.danger} />
          </TouchableOpacity>
        </GlassCard>

        <Button label={t.profile_logout} onPress={handleSignOut} variant="danger" fullWidth />
      </ScrollView>

      {/* Physical modal */}
      <BottomSheet visible={showPhysical} onClose={() => setShowPhysical(false)} title="Fiziksel Bilgiler" scrollable>
        <View style={{ gap: spacing[3] }}>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Input label="Boy (cm)" value={profile.height} onChangeText={(v) => setProfile((p) => ({ ...p, height: v }))} keyboardType="decimal-pad" placeholder="175" containerStyle={{ flex: 1 }} returnKeyType="next" />
            <Input label="Kilo (kg)" value={profile.weight} onChangeText={(v) => setProfile((p) => ({ ...p, weight: v }))} keyboardType="decimal-pad" placeholder="75" containerStyle={{ flex: 1 }} returnKeyType="next" />
          </View>
          <Input label="Yaş" value={profile.age} onChangeText={(v) => setProfile((p) => ({ ...p, age: v }))} keyboardType="number-pad" placeholder="22" returnKeyType="done" />

          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginTop: spacing[2] }}>Cinsiyet</Text>
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            {(['male', 'female'] as const).map((gender) => (
              <TouchableOpacity
                key={gender}
                onPress={() => setProfile((p) => ({ ...p, gender }))}
                style={{ flex: 1, paddingVertical: spacing[3], borderRadius: radius.lg, alignItems: 'center', backgroundColor: profile.gender === gender ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: profile.gender === gender ? palette.accent : colors.border }}
              >
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: profile.gender === gender ? '#fff' : colors.textMuted }}>
                  {gender === 'female' ? 'Kadin' : 'Erkek'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginTop: spacing[2] }}>Fitness Hedefi</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {FITNESS_GOALS.map((g) => (
              <TouchableOpacity key={g.key} onPress={() => setProfile((p) => ({ ...p, fitnessGoal: g.key }))}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], paddingVertical: 8, borderRadius: radius.lg, backgroundColor: profile.fitnessGoal === g.key ? palette.accent : colors.glassInner, borderWidth: 1, borderColor: profile.fitnessGoal === g.key ? palette.accent : colors.border }}>
                <Ionicons name={g.icon as never} size={14} color={profile.fitnessGoal === g.key ? '#fff' : colors.textMuted} />
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: profile.fitnessGoal === g.key ? '#fff' : colors.textMuted }}>{g.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginTop: spacing[2] }}>Aktivite Seviyesi</Text>
          <View style={{ gap: spacing[2] }}>
            {ACTIVITY_LEVELS.map((a) => (
              <TouchableOpacity key={a.key} onPress={() => setProfile((p) => ({ ...p, activityLevel: a.key }))}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing[4], borderRadius: radius.lg, backgroundColor: profile.activityLevel === a.key ? `${palette.accent}12` : colors.glassInner, borderWidth: 1, borderColor: profile.activityLevel === a.key ? palette.accent : colors.border }}>
                <View>
                  <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{a.label}</Text>
                  <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{a.sub}</Text>
                </View>
                {profile.activityLevel === a.key && <Ionicons name="checkmark-circle" size={20} color={palette.accent} />}
              </TouchableOpacity>
            ))}
          </View>

          <Button label={saving ? 'Kaydediliyor...' : 'Kaydet'} onPress={savePhysical} loading={saving} fullWidth style={{ marginTop: spacing[3] }} />
        </View>
      </BottomSheet>

      {/* Nutrition modal */}
      <BottomSheet visible={showNutrition} onClose={() => setShowNutrition(false)} title="Beslenme Hedefleri" scrollable>
        <View style={{ gap: spacing[3] }}>
          <View style={{ padding: spacing[3], borderRadius: radius.lg, backgroundColor: `${palette.accent}10`, borderWidth: 1, borderColor: `${palette.accent}20` }}>
            <Text style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>
              Fiziksel bilgilerinden kalori ve makro hedefi hesaplayabilir, sonra gerekirse elle duzenleyebilirsin.
            </Text>
          </View>
          <Button label="Otomatik Hesapla" onPress={calculateNutritionTargets} variant="secondary" fullWidth />
          <Input label="Günlük Kalori (kcal)" value={nutrition.calories} onChangeText={(v) => setNutrition((n) => ({ ...n, calories: v }))} keyboardType="number-pad" placeholder="2500" returnKeyType="next" />
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Input label="Protein (g)" value={nutrition.protein} onChangeText={(v) => setNutrition((n) => ({ ...n, protein: v }))} keyboardType="number-pad" placeholder="150" containerStyle={{ flex: 1 }} returnKeyType="next" />
            <Input label="Karb (g)" value={nutrition.carbs} onChangeText={(v) => setNutrition((n) => ({ ...n, carbs: v }))} keyboardType="number-pad" placeholder="250" containerStyle={{ flex: 1 }} returnKeyType="next" />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Input label="Yağ (g)" value={nutrition.fat} onChangeText={(v) => setNutrition((n) => ({ ...n, fat: v }))} keyboardType="number-pad" placeholder="70" containerStyle={{ flex: 1 }} returnKeyType="next" />
            <Input label="Lif (g)" value={nutrition.fiber} onChangeText={(v) => setNutrition((n) => ({ ...n, fiber: v }))} keyboardType="number-pad" placeholder="30" containerStyle={{ flex: 1 }} returnKeyType="done" />
          </View>
          <Button label={saving ? 'Kaydediliyor...' : 'Kaydet'} onPress={saveNutrition} loading={saving} fullWidth style={{ marginTop: spacing[3] }} />
        </View>
      </BottomSheet>
    </ScreenBackground>
  )
}

function SectionCard({ title, icon, onEdit, children, style }: { title: string; icon: string; onEdit: () => void; children: React.ReactNode; style?: object }) {
  const { colors } = useTheme()
  return (
    <GlassCard style={style}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <Ionicons name={icon as never} size={18} color={palette.accent} />
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>{title}</Text>
        </View>
        <TouchableOpacity onPress={onEdit} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="pencil-outline" size={14} color={colors.textMuted} />
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, fontWeight: fontWeight.medium }}>Düzenle</Text>
        </TouchableOpacity>
      </View>
      {children}
    </GlassCard>
  )
}

function InfoChip({ label, value, color }: { label: string; value: string; color?: string }) {
  const { colors } = useTheme()
  return (
    <View style={{ paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.md, backgroundColor: color ? `${color}12` : colors.glassInner, borderWidth: 1, borderColor: color ? `${color}25` : colors.border }}>
      <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: color ?? colors.textPrimary }}>{value}</Text>
    </View>
  )
}
