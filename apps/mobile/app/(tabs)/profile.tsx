import { useEffect, useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Calendar from 'expo-calendar'
import { supabase } from '@/src/lib/supabase'
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

const ACTIVITY_LEVELS = [
  { key: 'sedentary',          label: 'Hareketsiz',  sub: 'Masabaşı, spor yok' },
  { key: 'lightly_active',     label: 'Az Aktif',    sub: 'Haftada 1-3 gün spor' },
  { key: 'moderately_active',  label: 'Orta Aktif',  sub: 'Haftada 3-5 gün spor' },
  { key: 'very_active',        label: 'Çok Aktif',   sub: 'Haftada 6-7 gün spor' },
]

const FITNESS_GOALS = [
  { key: 'weight_loss',  label: 'Kilo Vermek',  icon: 'trending-down-outline' },
  { key: 'muscle_gain',  label: 'Kas Kazanmak', icon: 'barbell-outline' },
  { key: 'maintenance',  label: 'Kilo Korumak', icon: 'fitness-outline' },
  { key: 'endurance',    label: 'Dayanıklılık', icon: 'timer-outline' },
]

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: 'Açık',   icon: 'sunny-outline' },
  { mode: 'dark',  label: 'Koyu',   icon: 'moon-outline' },
  { mode: 'system',label: 'Sistem', icon: 'phone-portrait-outline' },
]

const LANG_OPTIONS: { lang: Language; label: string; flag: string }[] = [
  { lang: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { lang: 'en', label: 'English', flag: '🇬🇧' },
]

interface ProfileState {
  displayName: string; email: string
  height: string; weight: string; age: string
  fitnessGoal: string; activityLevel: string
}

interface NutritionState {
  calories: string; protein: string; carbs: string; fat: string; fiber: string
}

export default function ProfileScreen() {
  const { colors, mode, setMode } = useTheme()
  const { lang, setLang } = useLang()

  const [profile, setProfile] = useState<ProfileState>({
    displayName: '', email: '', height: '', weight: '', age: '',
    fitnessGoal: 'muscle_gain', activityLevel: 'moderately_active',
  })
  const [nutrition, setNutrition] = useState<NutritionState>({
    calories: '', protein: '', carbs: '', fat: '', fiber: '',
  })
  const [calendarStatus, setCalendarStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown')
  const [userId, setUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
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
      .eq('user_id', user.id)
      .maybeSingle()

    if (profileData?.preferences) {
      const p = profileData.preferences as Record<string, unknown>
      setProfile((prev) => ({
        ...prev,
        height:        p['height_cm']      != null ? String(p['height_cm'])      : '',
        weight:        p['weight_kg']      != null ? String(p['weight_kg'])      : '',
        age:           p['age']            != null ? String(p['age'])            : '',
        fitnessGoal:   p['fitness_goal']   != null ? String(p['fitness_goal'])   : 'muscle_gain',
        activityLevel: p['activity_level'] != null ? String(p['activity_level']) : 'moderately_active',
      }))
    }

    const { data: targetData } = await supabase
      .from('nutrition_targets')
      .select('calories, protein_g, carbs_g, fat_g, fiber_g')
      .eq('user_id', user.id)
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

    const calRes = await Calendar.getCalendarPermissionsAsync().catch(() => null)
    if (calRes) setCalendarStatus(calRes.status === 'granted' ? 'granted' : 'denied')
  }, [])

  useEffect(() => { void load() }, [load])

  async function savePhysical() {
    if (!userId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('user_profiles').upsert({
        user_id: userId,
        preferences: {
          height_cm:      parseFloat(profile.height)  || null,
          weight_kg:      parseFloat(profile.weight)  || null,
          age:            parseInt(profile.age)        || null,
          fitness_goal:   profile.fitnessGoal,
          activity_level: profile.activityLevel,
        },
      }, { onConflict: 'user_id' })
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
      const { error } = await supabase.from('nutrition_targets').upsert({
        user_id:   userId,
        calories:  parseFloat(nutrition.calories) || 2000,
        protein_g: parseFloat(nutrition.protein)  || 150,
        carbs_g:   parseFloat(nutrition.carbs)    || 250,
        fat_g:     parseFloat(nutrition.fat)      || 70,
        fiber_g:   parseFloat(nutrition.fiber)    || 30,
      }, { onConflict: 'user_id' })
      if (error) throw error
      setShowNutrition(false)
      Alert.alert('Kaydedildi', 'Beslenme hedeflerin güncellendi.')
    } catch {
      Alert.alert('Hata', 'Hedefler kaydedilemedi')
    } finally {
      setSaving(false)
    }
  }

  async function requestCalendarPermission() {
    const { status } = await Calendar.requestCalendarPermissionsAsync()
    const granted = status === 'granted'
    setCalendarStatus(granted ? 'granted' : 'denied')
    Alert.alert(
      granted ? '✓ Takvim Erişimi Verildi' : 'Erişim Reddedildi',
      granted ? 'Zaman bloklarını takviminizle senkronize edebilirsiniz.' : 'Ayarlar > Uygulama İzinleri kısmından takvim iznini verebilirsiniz.',
    )
  }

  function handleSignOut() {
    Alert.alert('Çıkış', 'Oturumu kapatmak istediğine emin misin?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  const initials = profile.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  const hasNutrition = !!(nutrition.calories || nutrition.protein)

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={{ padding: spacing[5], paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing[6] }}>
          Profil & Ayarlar
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

        {/* Physical info */}
        <SectionCard title="Fiziksel Bilgiler" icon="body-outline" onEdit={() => setShowPhysical(true)} style={{ marginBottom: spacing[4] }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            <InfoChip label="Boy" value={profile.height ? `${profile.height} cm` : '—'} />
            <InfoChip label="Kilo" value={profile.weight ? `${profile.weight} kg` : '—'} />
            <InfoChip label="Yaş" value={profile.age || '—'} />
            <InfoChip label="Hedef" value={FITNESS_GOALS.find((g) => g.key === profile.fitnessGoal)?.label ?? '—'} />
            <InfoChip label="Aktivite" value={ACTIVITY_LEVELS.find((a) => a.key === profile.activityLevel)?.label ?? '—'} />
          </View>
        </SectionCard>

        {/* Nutrition targets */}
        <SectionCard title="Beslenme Hedefleri" icon="nutrition-outline" onEdit={() => setShowNutrition(true)} style={{ marginBottom: spacing[4] }}>
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
        <GlassCard style={{ marginBottom: spacing[4] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], flex: 1 }}>
              <Ionicons name="calendar-outline" size={18} color={palette.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>Takvim Entegrasyonu</Text>
                <Text style={{ fontSize: fontSize.xs, color: calendarStatus === 'granted' ? palette.success : colors.textMuted, marginTop: 2 }}>
                  {calendarStatus === 'granted' ? '✓ Erişim verildi' : calendarStatus === 'denied' ? '✗ Erişim reddedildi' : 'İzin verilmemiş'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={requestCalendarPermission}
              style={{ paddingHorizontal: spacing[3], paddingVertical: 7, borderRadius: radius.full, backgroundColor: calendarStatus === 'granted' ? `${palette.success}15` : `${palette.accent}15`, borderWidth: 1, borderColor: calendarStatus === 'granted' ? `${palette.success}30` : `${palette.accent}30` }}
            >
              <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: calendarStatus === 'granted' ? palette.success : palette.accent }}>
                {calendarStatus === 'granted' ? 'Verildi' : 'İzin Ver'}
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

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
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, marginBottom: spacing[4] }}>Tema</Text>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            {THEME_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.mode}
                onPress={() => setMode(opt.mode)}
                style={{ flex: 1, alignItems: 'center', gap: spacing[2], paddingVertical: spacing[3], borderRadius: radius.lg, backgroundColor: mode === opt.mode ? `${palette.accent}18` : colors.glassInner, borderWidth: 1, borderColor: mode === opt.mode ? palette.accent : colors.border }}
              >
                <Ionicons name={opt.icon as never} size={20} color={mode === opt.mode ? palette.accent : colors.textMuted} />
                <Text style={{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: mode === opt.mode ? palette.accent : colors.textMuted }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </GlassCard>

        <Button label="Oturumu Kapat" onPress={handleSignOut} variant="danger" fullWidth />
      </ScrollView>

      {/* Physical modal */}
      <BottomSheet visible={showPhysical} onClose={() => setShowPhysical(false)} title="Fiziksel Bilgiler" scrollable>
        <View style={{ gap: spacing[3] }}>
          <View style={{ flexDirection: 'row', gap: spacing[3] }}>
            <Input label="Boy (cm)" value={profile.height} onChangeText={(v) => setProfile((p) => ({ ...p, height: v }))} keyboardType="decimal-pad" placeholder="175" containerStyle={{ flex: 1 }} returnKeyType="next" />
            <Input label="Kilo (kg)" value={profile.weight} onChangeText={(v) => setProfile((p) => ({ ...p, weight: v }))} keyboardType="decimal-pad" placeholder="75" containerStyle={{ flex: 1 }} returnKeyType="next" />
          </View>
          <Input label="Yaş" value={profile.age} onChangeText={(v) => setProfile((p) => ({ ...p, age: v }))} keyboardType="number-pad" placeholder="22" returnKeyType="done" />

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
