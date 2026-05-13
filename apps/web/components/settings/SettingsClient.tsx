'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import {
  APP_DEFAULTS,
  calculateTDEE,
  suggestMacrosFromTDEE,
  type ActivityLevel,
  type FitnessGoal,
} from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'
import { useTheme } from '@/lib/contexts/ThemeContext'
import { useSubscription } from '@/lib/hooks/useSubscription'
import Link from 'next/link'

interface UserProfile {
  display_name: string
  timezone: string
  preferences: {
    theme: string
    morning_briefing_time: string
    evening_summary_time: string
    daily_effort_limit: number
    week_start: string
  }
}

interface BodyForm {
  weight_kg: number
  height_cm: number
  age: number
  gender: 'male' | 'female'
  activity_level: ActivityLevel
  fitness_goal: FitnessGoal
}

interface NutritionTargetForm {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

export default function SettingsClient({ userId }: { userId: string }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState<'profile' | 'nutrition' | 'fitness' | 'notifications' | 'security'>('profile')

  const { lang, setLang, t } = useLang()
  const { theme, setTheme } = useTheme()
  const { subscription, isPro, loading: subLoading } = useSubscription()
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [subSaving, setSubSaving] = useState(false)

  // Security state
  const [currentEmail, setCurrentEmail] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [secSaving, setSecSaving] = useState(false)
  const [secError, setSecError] = useState<string | null>(null)

  // 2FA state
  const [twoFaEnabled, setTwoFaEnabled] = useState(false)
  const [twoFaLoading, setTwoFaLoading] = useState(false)
  const [enrollData, setEnrollData] = useState<{ factorId: string; qrCode: string; secret: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')

  function handleLangChange(l: typeof lang) {
    setLang(l)
    showToast(l === 'tr' ? 'Dil değiştirildi' : 'Language changed', 'success')
  }

  // Body / fitness state
  const [bodyForm, setBodyForm] = useState<BodyForm>({
    weight_kg: 75,
    height_cm: 175,
    age: 25,
    gender: 'male',
    activity_level: 'moderately_active',
    fitness_goal: 'general',
  })

  // Profile state
  const [profile, setProfile] = useState<UserProfile>({
    display_name: '',
    timezone: APP_DEFAULTS.TIMEZONE,
    preferences: {
      theme: 'light',
      morning_briefing_time: APP_DEFAULTS.MORNING_BRIEFING_TIME,
      evening_summary_time: APP_DEFAULTS.EVENING_SUMMARY_TIME,
      daily_effort_limit: APP_DEFAULTS.DAILY_EFFORT_LIMIT,
      week_start: APP_DEFAULTS.WEEK_START,
    },
  })

  // Nutrition target state
  const [nutritionTarget, setNutritionTarget] = useState<NutritionTargetForm>({
    calories: APP_DEFAULTS.DEFAULT_CALORIES,
    protein_g: APP_DEFAULTS.DEFAULT_PROTEIN_G,
    carbs_g: APP_DEFAULTS.DEFAULT_CARBS_G,
    fat_g: APP_DEFAULTS.DEFAULT_FAT_G,
    fiber_g: APP_DEFAULTS.DEFAULT_FIBER_G,
  })

  // Check 2FA status on mount
  useEffect(() => {
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      setTwoFaEnabled((data?.totp ?? []).some((f) => f.status === 'verified'))
    })
  }, [])

  // Veri yükle
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email) setCurrentEmail(user.email)
        // Supabase sets new_email when a change is pending confirmation
        const newEmailPending = (user as unknown as Record<string, unknown>)['new_email'] as string | undefined
        if (newEmailPending) setPendingEmail(newEmailPending)

        const [profileRes, targetRes] = await Promise.all([
          supabase.from('user_profiles').select('*').eq('id', userId).single(),
          supabase.from('nutrition_targets').select('*').eq('user_id', userId).eq('is_active', true).maybeSingle(),
        ])

        if (profileRes.error) throw profileRes.error

        if (profileRes.data) {
          const p = profileRes.data
          const prefs = (p.preferences as Record<string, unknown>) ?? {}
          setProfile({
            display_name: p.display_name ?? '',
            timezone: p.timezone ?? APP_DEFAULTS.TIMEZONE,
            preferences: {
              theme: prefs['theme'] as string ?? 'light',
              morning_briefing_time: prefs['morning_briefing_time'] as string ?? APP_DEFAULTS.MORNING_BRIEFING_TIME,
              evening_summary_time: prefs['evening_summary_time'] as string ?? APP_DEFAULTS.EVENING_SUMMARY_TIME,
              daily_effort_limit: prefs['daily_effort_limit'] as number ?? APP_DEFAULTS.DAILY_EFFORT_LIMIT,
              week_start: prefs['week_start'] as string ?? APP_DEFAULTS.WEEK_START,
            },
          })
          setBodyForm({
            weight_kg: (prefs['body_weight_kg'] as number) ?? 75,
            height_cm: (prefs['height_cm'] as number) ?? 175,
            age: (prefs['age'] as number) ?? 25,
            gender: (prefs['gender'] as 'male' | 'female') ?? 'male',
            activity_level: (prefs['activity_level'] as ActivityLevel) ?? 'moderately_active',
            fitness_goal: (prefs['fitness_goal'] as FitnessGoal) ?? 'general',
          })
        }

        if (targetRes.error) throw targetRes.error

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
      } catch {
        showToast('Ayarlar yüklenemedi', 'error')
      } finally {
        setLoading(false)
      }
    }
    void loadData()
  }, [showToast, userId])

  const handleSaveProfile = useCallback(async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          display_name: profile.display_name,
          timezone: profile.timezone,
          preferences: profile.preferences,
        })
        .eq('id', userId)
      if (error) throw error
      showToast('Profil güncellendi', 'success')
    } catch {
      showToast('Profil güncellenemedi', 'error')
    } finally {
      setSaving(false)
    }
  }, [profile, showToast, userId])

  const handleSaveNutrition = useCallback(async () => {
    setSaving(true)
    try {
      const { data: newTarget, error: insertError } = await supabase
        .from('nutrition_targets')
        .insert({
          user_id: userId,
          ...nutritionTarget,
          is_active: true,
        })
        .select('id')
        .single()

      if (insertError) throw insertError

      const { error: deactivateError } = await supabase
        .from('nutrition_targets')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true)
        .neq('id', newTarget.id)

      if (deactivateError) throw deactivateError

      showToast('Beslenme hedefleri güncellendi', 'success')
    } catch {
      showToast('Beslenme hedefleri güncellenemedi', 'error')
    } finally {
      setSaving(false)
    }
  }, [nutritionTarget, showToast, userId])

  const handleLogout = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      router.push('/login')
    } catch {
      showToast('Çıkış yapılamadı', 'error')
    }
  }, [router, showToast])

  const handleEmailChange = useCallback(async () => {
    if (!newEmail.trim()) return
    setSecSaving(true); setSecError(null)
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() })
      if (error) throw error
      setPendingEmail(newEmail.trim())
      setNewEmail('')
      showToast('Onay e-postası gönderildi. Yeni adresinizi doğrulayın.', 'success')
    } catch (err: unknown) {
      setSecError(err instanceof Error ? err.message : 'Hata oluştu')
    } finally {
      setSecSaving(false)
    }
  }, [newEmail, showToast])

  const handlePasswordChange = useCallback(async () => {
    if (newPassword !== confirmPassword) { setSecError(t.settings_sec_pw_mismatch); return }
    if (newPassword.length < 8) { setSecError('Şifre en az 8 karakter olmalı'); return }
    setSecSaving(true); setSecError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      showToast('Şifre güncellendi', 'success')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (err: unknown) {
      setSecError(err instanceof Error ? err.message : 'Hata oluştu')
    } finally {
      setSecSaving(false)
    }
  }, [newPassword, confirmPassword, showToast, t])

  const handleEnable2FA = useCallback(async () => {
    setTwoFaLoading(true); setSecError(null)
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'LifeOS' })
      if (error) throw error
      setEnrollData({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
    } catch (err: unknown) {
      setSecError(err instanceof Error ? err.message : 'Hata oluştu')
    } finally {
      setTwoFaLoading(false)
    }
  }, [])

  const handleVerify2FA = useCallback(async () => {
    if (!enrollData || totpCode.length !== 6) return
    setTwoFaLoading(true); setSecError(null)
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: enrollData.factorId })
      if (cErr) throw cErr
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: enrollData.factorId,
        challengeId: challenge.id,
        code: totpCode,
      })
      if (vErr) throw vErr
      setTwoFaEnabled(true); setEnrollData(null); setTotpCode('')
      showToast('2FA etkinleştirildi', 'success')
    } catch (err: unknown) {
      setSecError(err instanceof Error ? err.message : 'Kod hatalı')
    } finally {
      setTwoFaLoading(false)
    }
  }, [enrollData, totpCode, showToast])

  const handleDisable2FA = useCallback(async () => {
    setTwoFaLoading(true); setSecError(null)
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.[0]
      if (!totp) { showToast('2FA bulunamadı', 'info'); return }
      const { error } = await supabase.auth.mfa.unenroll({ factorId: totp.id })
      if (error) throw error
      setTwoFaEnabled(false)
      showToast('2FA kaldırıldı', 'success')
    } catch (err: unknown) {
      setSecError(err instanceof Error ? err.message : 'Hata oluştu')
    } finally {
      setTwoFaLoading(false)
    }
  }, [showToast])

  const handleCancelSubscription = useCallback(async () => {
    setSubSaving(true)
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ cancel_at_period_end: true })
        .eq('user_id', userId)
      if (error) throw error
      showToast('Abonelik dönem sonunda iptal edilecek', 'info')
      setShowCancelConfirm(false)
      router.refresh()
    } catch {
      showToast('İşlem gerçekleştirilemedi', 'error')
    } finally {
      setSubSaving(false)
    }
  }, [userId, showToast, router])

  const handleResumeSubscription = useCallback(async () => {
    setSubSaving(true)
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ cancel_at_period_end: false })
        .eq('user_id', userId)
      if (error) throw error
      showToast('Abonelik yenileme yeniden etkinleştirildi', 'success')
      router.refresh()
    } catch {
      showToast('İşlem gerçekleştirilemedi', 'error')
    } finally {
      setSubSaving(false)
    }
  }, [userId, showToast, router])

  const handleSaveFitness = useCallback(async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          preferences: {
            ...profile.preferences,
            body_weight_kg: bodyForm.weight_kg,
            height_cm: bodyForm.height_cm,
            age: bodyForm.age,
            gender: bodyForm.gender,
            activity_level: bodyForm.activity_level,
            fitness_goal: bodyForm.fitness_goal,
          },
        })
        .eq('id', userId)
      if (error) throw error
      showToast('Fitness ayarları güncellendi', 'success')
    } catch {
      showToast('Fitness ayarları güncellenemedi', 'error')
    } finally {
      setSaving(false)
    }
  }, [profile.preferences, bodyForm, showToast, userId])

  const handleApplyTDEE = useCallback(() => {
    const tdee = calculateTDEE({
      weight_kg: bodyForm.weight_kg,
      height_cm: bodyForm.height_cm,
      age: bodyForm.age,
      gender: bodyForm.gender,
      activity_level: bodyForm.activity_level,
    })
    const suggested = suggestMacrosFromTDEE(tdee, bodyForm.fitness_goal)
    setNutritionTarget(suggested)
    setActiveSection('nutrition')
  }, [bodyForm])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  const sections = [
    { key: 'profile' as const, label: t.settings_profile },
    { key: 'nutrition' as const, label: t.settings_nutrition_tab },
    { key: 'fitness' as const, label: t.settings_fitness_tab },
    { key: 'notifications' as const, label: t.settings_notifications_tab },
    { key: 'security' as const, label: t.settings_security },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-primary">{t.settings_title}</h1>

      {/* Section tabs */}
      <div className="flex gap-2 rounded-xl bg-border/50 p-1 dark:bg-border/30">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeSection === s.key
                ? 'bg-surface text-primary shadow-sm'
                : 'text-muted hover:text-primary'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Profil */}
      {activeSection === 'profile' && (
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-primary">{t.settings_profile_title}</h2>

          <Input
            label={t.settings_display_name}
            value={profile.display_name}
            onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
          />

          {/* Dil / Language */}
          <div>
            <label className="mb-1 block text-sm font-medium text-primary">{t.settings_lang}</label>
            <p className="mb-2 text-xs text-muted">{t.settings_lang_desc}</p>
            <div className="flex w-fit overflow-hidden rounded-xl border border-border">
              {(['en', 'tr'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => handleLangChange(l)}
                  className={`px-5 py-2 text-sm font-semibold transition-colors ${
                    lang === l
                      ? 'bg-accent text-white'
                      : 'bg-surface text-muted hover:bg-background'
                  }`}
                >
                  {l === 'en' ? '🇬🇧 English' : '🇹🇷 Türkçe'}
                </button>
              ))}
            </div>
          </div>

          {/* Tema / Theme */}
          <div>
            <label className="mb-1 block text-sm font-medium text-primary">
              {t.settings_theme ?? 'Theme'}
            </label>
            <p className="mb-2 text-xs text-muted">{t.settings_theme_desc ?? 'Choose your preferred color scheme'}</p>
            <div className="flex w-fit gap-2">
              {([
                { value: 'light', icon: '☀️', label: t.settings_theme_light ?? 'Light' },
                { value: 'dark',  icon: '🌙', label: t.settings_theme_dark  ?? 'Dark'  },
              ] as const).map(({ value, icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-all ${
                    theme === value
                      ? 'border-accent bg-accent/10 text-accent shadow-sm'
                      : 'border-border bg-surface text-muted hover:bg-background'
                  }`}
                >
                  <span>{icon}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-primary">{t.settings_timezone}</label>
            <select
              value={profile.timezone}
              onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-accent dark:bg-surface"
            >
              <option value="Europe/Istanbul">Europe/Istanbul (UTC+3)</option>
              <option value="Europe/London">Europe/London (UTC+0/+1)</option>
              <option value="Europe/Berlin">Europe/Berlin (UTC+1/+2)</option>
              <option value="America/New_York">America/New_York (UTC-5/-4)</option>
              <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t.settings_effort_limit}
              type="number"
              value={profile.preferences.daily_effort_limit}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  preferences: {
                    ...profile.preferences,
                    daily_effort_limit: parseInt(e.target.value) || 25,
                  },
                })
              }
              min={10}
              max={50}
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-primary">{t.settings_week_start}</label>
              <select
                value={profile.preferences.week_start}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    preferences: { ...profile.preferences, week_start: e.target.value },
                  })
                }
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-accent dark:bg-surface"
              >
                <option value="monday">{t.settings_week_mon}</option>
                <option value="sunday">{t.settings_week_sun}</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
            <h3 className="mb-2 text-sm font-semibold text-accent">{t.settings_calendar}</h3>
            <p className="text-sm text-muted">{t.settings_calendar_note}</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void handleSaveProfile()} loading={saving}>
              {t.settings_save_profile}
            </Button>
          </div>
        </div>
      )}

      {/* Beslenme Hedefleri */}
      {activeSection === 'nutrition' && (
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-primary">{t.settings_nutrition_title}</h2>
          <p className="text-xs text-muted">{t.settings_nutrition_note}</p>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t.settings_calories}
              type="number"
              value={nutritionTarget.calories}
              onChange={(e) => setNutritionTarget({ ...nutritionTarget, calories: parseInt(e.target.value) || 0 })}
              min={500}
              max={10000}
              step={50}
            />
            <Input
              label={t.settings_protein}
              type="number"
              value={nutritionTarget.protein_g}
              onChange={(e) => setNutritionTarget({ ...nutritionTarget, protein_g: parseInt(e.target.value) || 0 })}
              min={0}
              max={500}
              step={5}
            />
            <Input
              label={t.settings_carbs}
              type="number"
              value={nutritionTarget.carbs_g}
              onChange={(e) => setNutritionTarget({ ...nutritionTarget, carbs_g: parseInt(e.target.value) || 0 })}
              min={0}
              max={800}
              step={5}
            />
            <Input
              label={t.settings_fat}
              type="number"
              value={nutritionTarget.fat_g}
              onChange={(e) => setNutritionTarget({ ...nutritionTarget, fat_g: parseInt(e.target.value) || 0 })}
              min={0}
              max={300}
              step={5}
            />
            <Input
              label={t.settings_fiber}
              type="number"
              value={nutritionTarget.fiber_g}
              onChange={(e) => setNutritionTarget({ ...nutritionTarget, fiber_g: parseInt(e.target.value) || 0 })}
              min={0}
              max={100}
              step={5}
            />
          </div>

          {/* Makro dağılım özeti */}
          <div className="rounded-xl bg-background p-4">
            <p className="mb-2 text-xs font-medium text-muted">{t.nutr_macro_breakdown}</p>
            <div className="flex gap-4 text-xs">
              <span className="text-primary">
                Protein: <b>{nutritionTarget.protein_g * 4} kcal</b> ({nutritionTarget.calories > 0 ? Math.round((nutritionTarget.protein_g * 4 / nutritionTarget.calories) * 100) : 0}%)
              </span>
              <span className="text-primary">
                Karb: <b>{nutritionTarget.carbs_g * 4} kcal</b> ({nutritionTarget.calories > 0 ? Math.round((nutritionTarget.carbs_g * 4 / nutritionTarget.calories) * 100) : 0}%)
              </span>
              <span className="text-primary">
                Yağ: <b>{nutritionTarget.fat_g * 9} kcal</b> ({nutritionTarget.calories > 0 ? Math.round((nutritionTarget.fat_g * 9 / nutritionTarget.calories) * 100) : 0}%)
              </span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void handleSaveNutrition()} loading={saving}>
              {t.settings_save_nutrition}
            </Button>
          </div>
        </div>
      )}

      {/* Fitness */}
      {activeSection === 'fitness' && (
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-primary">{t.settings_fitness_title}</h2>
          <p className="text-xs text-muted">{t.settings_fitness_note}</p>

          {/* Cinsiyet */}
          <div>
            <label className="mb-2 block text-sm font-medium text-primary">{t.settings_gender}</label>
            <div className="flex gap-3">
              {([['male', t.settings_gender_male], ['female', t.settings_gender_female]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setBodyForm({ ...bodyForm, gender: val })}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                    bodyForm.gender === val
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted hover:border-border'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              label={t.settings_weight}
              type="number"
              value={bodyForm.weight_kg}
              onChange={(e) => setBodyForm({ ...bodyForm, weight_kg: parseInt(e.target.value) || 75 })}
              min={30}
              max={200}
              step={1}
            />
            <Input
              label={t.settings_height}
              type="number"
              value={bodyForm.height_cm}
              onChange={(e) => setBodyForm({ ...bodyForm, height_cm: parseInt(e.target.value) || 175 })}
              min={100}
              max={250}
              step={1}
            />
            <Input
              label={t.settings_age}
              type="number"
              value={bodyForm.age}
              onChange={(e) => setBodyForm({ ...bodyForm, age: parseInt(e.target.value) || 25 })}
              min={10}
              max={100}
              step={1}
            />
          </div>

          {/* Aktivite Seviyesi */}
          <div>
            <label className="mb-2 block text-sm font-medium text-primary">{t.settings_activity}</label>
            <div className="space-y-2">
              {([
                ['sedentary',        t.activity_sedentary],
                ['lightly_active',   t.activity_lightly],
                ['moderately_active',t.activity_moderately],
                ['very_active',      t.activity_very],
                ['extra_active',     t.activity_extra],
              ] as [ActivityLevel, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setBodyForm({ ...bodyForm, activity_level: val })}
                  className={`flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-all ${
                    bodyForm.activity_level === val
                      ? 'border-accent bg-accent/10 text-accent font-medium'
                      : 'border-border text-primary hover:border-border'
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full border-2 ${bodyForm.activity_level === val ? 'border-accent bg-accent' : 'border-border'}`} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Fitness Hedefi */}
          <div>
            <label className="mb-2 block text-sm font-medium text-primary">{t.settings_fitness_goal}</label>
            <div className="flex gap-3">
              {([['general', t.settings_goal_general], ['muscle_gain', t.settings_goal_muscle], ['fat_loss', t.settings_goal_fat]] as const).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setBodyForm({ ...bodyForm, fitness_goal: val })}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                    bodyForm.fitness_goal === val
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted hover:border-border'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* TDEE Hesaplama */}
          {(() => {
            const tdee = calculateTDEE({ weight_kg: bodyForm.weight_kg, height_cm: bodyForm.height_cm, age: bodyForm.age, gender: bodyForm.gender, activity_level: bodyForm.activity_level })
            const suggested = suggestMacrosFromTDEE(tdee, bodyForm.fitness_goal)
            return (
              <div className="rounded-xl bg-accent/5 border border-accent/20 p-4">
                <p className="text-sm font-semibold text-accent">{t.settings_tdee}</p>
                <p className="mt-1 text-2xl font-bold text-accent">{tdee} kcal</p>
                <p className="mt-0.5 text-xs text-muted">Harris-Benedict — {suggested.calories} kcal</p>
                <div className="mt-3 flex gap-3 text-xs text-muted">
                  <span>P: <b className="text-primary">{suggested.protein_g}g</b></span>
                  <span>C: <b className="text-primary">{suggested.carbs_g}g</b></span>
                  <span>F: <b className="text-primary">{suggested.fat_g}g</b></span>
                </div>
                <button
                  onClick={handleApplyTDEE}
                  className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90"
                >
                  {t.settings_apply_nutrition}
                </button>
              </div>
            )
          })()}

          <div className="flex justify-end">
            <Button onClick={() => void handleSaveFitness()} loading={saving}>
              {t.settings_save_fitness}
            </Button>
          </div>
        </div>
      )}

      {/* Bildirimler */}
      {activeSection === 'notifications' && (
        <div className="glass rounded-2xl p-6 space-y-5">
          <h2 className="text-lg font-semibold text-primary">{t.settings_notif_title}</h2>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label={t.settings_morning}
              type="time"
              value={profile.preferences.morning_briefing_time}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  preferences: { ...profile.preferences, morning_briefing_time: e.target.value },
                })
              }
            />
            <Input
              label={t.settings_evening}
              type="time"
              value={profile.preferences.evening_summary_time}
              onChange={(e) =>
                setProfile({
                  ...profile,
                  preferences: { ...profile.preferences, evening_summary_time: e.target.value },
                })
              }
            />
          </div>

          <p className="text-xs text-muted">{t.settings_notif_note}</p>

          {/* Email bildirimleri */}
          <div className="rounded-xl border border-border/60 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-primary">{t.settings_notif_email_title}</h3>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm text-primary">{t.settings_notif_email_morning}</span>
              <input
                type="checkbox"
                checked={(profile.preferences as unknown as Record<string, unknown>)['email_morning_enabled'] as boolean ?? false}
                onChange={(e) => setProfile({ ...profile, preferences: { ...profile.preferences, email_morning_enabled: e.target.checked } as typeof profile.preferences })}
                className="h-4 w-4 rounded accent-accent"
              />
            </label>
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm text-primary">{t.settings_notif_email_evening}</span>
              <input
                type="checkbox"
                checked={(profile.preferences as unknown as Record<string, unknown>)['email_evening_enabled'] as boolean ?? false}
                onChange={(e) => setProfile({ ...profile, preferences: { ...profile.preferences, email_evening_enabled: e.target.checked } as typeof profile.preferences })}
                className="h-4 w-4 rounded accent-accent"
              />
            </label>
            <p className="text-xs text-muted">{t.settings_notif_email_hint}</p>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => void handleSaveProfile()} loading={saving}>
              {t.settings_save_notif}
            </Button>
          </div>
        </div>
      )}

      {/* Güvenlik */}
      {activeSection === 'security' && (
        <div className="space-y-4">
          {/* E-posta değiştir */}
          <div className="glass rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-primary">{t.settings_sec_email_title}</h2>

            {/* Adım 1 — Mevcut e-posta */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Mevcut E-posta</p>
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-border/20 px-3.5 py-2.5">
                <svg className="h-4 w-4 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="flex-1 text-sm text-primary">{currentEmail || '—'}</span>
                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">✓ Doğrulandı</span>
              </div>
            </div>

            {/* Onay bekliyor banner */}
            {pendingEmail && (
              <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3">
                <span className="mt-0.5 text-base">⏳</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-warning">Onay Bekleniyor</p>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className="font-medium text-primary">{pendingEmail}</span> adresine onay maili gönderildi.
                    Mailinizi açıp linke tıklayana kadar adres değişmez.
                  </p>
                </div>
              </div>
            )}

            {/* Adım 2 — Yeni e-posta */}
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Yeni E-posta</p>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => { setNewEmail(e.target.value); setSecError(null) }}
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-primary outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/10"
                placeholder="yeni@email.com"
              />
            </div>

            <p className="text-xs text-muted">{t.settings_sec_email_hint}</p>
            {secError && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-danger">{secError}</p>}
            <Button size="sm" onClick={() => void handleEmailChange()} loading={secSaving} disabled={!newEmail.trim()}>
              {t.settings_sec_email_btn}
            </Button>
          </div>

          {/* Şifre değiştir */}
          <div className="glass rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-primary">{t.settings_sec_pw_title}</h2>
            <div>
              <label className="mb-1 block text-sm font-medium text-primary">{t.settings_sec_pw_new}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setSecError(null) }}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-accent"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-primary">{t.settings_sec_pw_confirm}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setSecError(null) }}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-primary outline-none focus:border-accent"
                placeholder="••••••••"
              />
            </div>
            {secError && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-danger">{secError}</p>}
            <Button size="sm" onClick={() => void handlePasswordChange()} loading={secSaving} disabled={!newPassword}>
              {t.settings_sec_pw_btn}
            </Button>
          </div>

          {/* 2FA */}
          <div className="glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-primary">{t.settings_sec_2fa_title}</h2>
                <p className="mt-0.5 text-xs text-muted">{t.settings_sec_2fa_desc}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${twoFaEnabled ? 'bg-success/10 text-success' : 'bg-border/40 text-muted'}`}>
                {twoFaEnabled ? t.settings_sec_2fa_enabled : t.settings_sec_2fa_disabled}
              </span>
            </div>

            {enrollData ? (
              /* QR code enrollment flow */
              <div className="space-y-4">
                <p className="text-xs text-muted">{t.settings_sec_2fa_scan}</p>
                <div className="flex justify-center rounded-xl border border-border bg-white p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={enrollData.qrCode} alt="2FA QR Code" className="h-40 w-40" />
                </div>
                <div className="rounded-lg bg-border/20 px-3 py-2">
                  <p className="text-[10px] text-muted">{t.settings_sec_2fa_backup}</p>
                  <p className="mt-0.5 font-mono text-xs text-primary break-all">{enrollData.secret}</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-primary">{t.settings_sec_2fa_code}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-center text-lg font-mono tracking-widest text-primary outline-none focus:border-accent"
                    placeholder="123456"
                  />
                </div>
                {secError && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-danger">{secError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handleVerify2FA()} loading={twoFaLoading} disabled={totpCode.length !== 6}>
                    {t.settings_sec_2fa_verify}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEnrollData(null); setTotpCode(''); setSecError(null) }}>
                    {t.settings_sec_2fa_cancel}
                  </Button>
                </div>
              </div>
            ) : twoFaEnabled ? (
              <Button size="sm" variant="danger" onClick={() => void handleDisable2FA()} loading={twoFaLoading}>
                {t.settings_sec_2fa_disable}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => void handleEnable2FA()} loading={twoFaLoading}>
                {t.settings_sec_2fa_enable}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Abonelik */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <h3 className="font-semibold text-primary">{t.settings_sub_title}</h3>

        {subLoading ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        ) : !isPro && !subscription?.cancel_at_period_end ? (
          /* Ücretsiz plan */
          <div className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-primary">{t.settings_sub_free}</p>
              <p className="text-xs text-muted">AI özellikleri için Pro&apos;ya geçin</p>
            </div>
            <Link
              href="/billing"
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90"
            >
              {t.settings_sub_upgrade}
            </Link>
          </div>
        ) : subscription?.cancel_at_period_end ? (
          /* İptal edilmiş, dönem sonuna kadar aktif */
          <div className="space-y-3">
            <div className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-warning">
                    {subscription.status === 'pro_annual' ? t.settings_sub_annual : t.settings_sub_monthly}
                  </p>
                  {subscription.current_period_end && (
                    <p className="mt-0.5 text-xs text-muted">
                      {t.settings_sub_cancelled_note}{' '}
                      <span className="font-medium text-primary">
                        {new Date(subscription.current_period_end).toLocaleDateString('tr-TR')}
                      </span>
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold text-warning">
                  İptal Edildi
                </span>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              loading={subSaving}
              onClick={() => void handleResumeSubscription()}
            >
              {t.settings_sub_resume}
            </Button>
          </div>
        ) : (
          /* Aktif Pro */
          <div className="space-y-3">
            <div className="rounded-xl border border-accent/30 bg-accent/5 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-accent">
                    {subscription?.status === 'pro_annual' ? t.settings_sub_annual : t.settings_sub_monthly}
                  </p>
                  {subscription?.current_period_end && (
                    <p className="mt-0.5 text-xs text-muted">
                      {t.settings_sub_renews}{' '}
                      <span className="font-medium text-primary">
                        {new Date(subscription.current_period_end).toLocaleDateString('tr-TR')}
                      </span>
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  Pro ✨
                </span>
              </div>
            </div>

            {!showCancelConfirm ? (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="text-xs text-muted hover:text-danger transition-colors underline-offset-2 hover:underline"
              >
                {t.settings_sub_cancel}
              </button>
            ) : (
              <div className="rounded-xl border border-danger/20 bg-danger/5 p-4 space-y-3">
                <p className="text-sm font-medium text-primary">Aboneliği iptal etmek istediğinize emin misiniz?</p>
                <p className="text-xs text-muted">{t.settings_sub_cancel_hint}</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    loading={subSaving}
                    onClick={() => void handleCancelSubscription()}
                  >
                    {t.settings_sub_cancel_yes}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowCancelConfirm(false)}
                  >
                    {t.settings_sub_keep}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Çıkış */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-primary">{t.settings_account}</h3>
          </div>
          <Button variant="danger" size="sm" onClick={() => void handleLogout()}>
            {t.settings_logout}
          </Button>
        </div>
      </div>
    </div>
  )
}
