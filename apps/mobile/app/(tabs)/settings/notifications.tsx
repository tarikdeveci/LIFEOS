import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, Switch, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import {
  BLOCK_REMINDER_CHOICES,
  DEFAULT_EMAIL_PREFERENCES,
  DEFAULT_PUSH_PREFERENCES,
  type BlockReminderMinutes,
  type EmailPreferences,
  type PushPreferences,
} from '@lifeos/shared'
// Sorgu fonksiyonlari kok barrel'dan DEGIL: dairesel bagimlilik olmasin diye
// supabase/* ayri giristen disa aciliyor (packages/shared/src/index.ts).
import {
  getEmailPreferences,
  getPushPreferences,
  updateEmailPreferences,
  updatePushPreferences,
} from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

/**
 * Bildirim ayarları.
 *
 * Bu ekrana kadar mobil uygulamada bildirimleri kapatmanın hiçbir yolu yoktu:
 * push tercihleri yalnızca veritabanında, e-posta tercihleri yalnızca web
 * panelinde düzenlenebiliyordu. Kullanıcının tek çıkışı, işletim sistemi
 * seviyesinde uygulamanın TÜM bildirimlerini kapatmaktı.
 *
 * İki farklı depoya yazıyor (bkz. types/notifications.ts): push tercihleri
 * notification_preferences tablosuna, e-posta tercihleri user_profiles
 * .preferences JSONB'sine. Ekran bu ayrımı kullanıcıya göstermiyor ama kod
 * seviyesinde ayrı tutuyor.
 */

const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

interface ToggleRowProps {
  icon: string
  title: string
  subtitle: string
  value: boolean
  onValueChange: (next: boolean) => void
}

function ToggleRow({ icon, title, subtitle, value, onValueChange }: ToggleRowProps) {
  const { colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
      <Ionicons name={icon as never} size={18} color={palette.accent} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
          {title}
        </Text>
        <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.glassBorder, true: `${palette.accent}80` }}
        thumbColor={value ? palette.accent : colors.textSubtle}
      />
    </View>
  )
}

/** Saat seçici: 0-23 arasında dolanan artır/azalt. Ek bağımlılık gerektirmez. */
function HourStepper({ hour, onChange, disabled }: { hour: number; onChange: (h: number) => void; disabled?: boolean }) {
  const { colors } = useTheme()
  const step = (delta: number) => onChange((hour + delta + 24) % 24)
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing[3],
        opacity: disabled ? 0.35 : 1,
        marginTop: spacing[3],
        alignSelf: 'flex-start',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.glassBorder,
        paddingHorizontal: spacing[2],
        paddingVertical: spacing[1],
      }}
    >
      <TouchableOpacity onPress={() => step(-1)} disabled={disabled} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
      <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary, minWidth: 52, textAlign: 'center' }}>
        {hourLabel(hour)}
      </Text>
      <TouchableOpacity onPress={() => step(1)} disabled={disabled} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  )
}

function SectionTitle({ children }: { children: string }) {
  const { colors } = useTheme()
  return (
    <Text
      style={{
        fontSize: fontSize.sm,
        fontWeight: fontWeight.semibold,
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: spacing[3],
      }}
    >
      {children}
    </Text>
  )
}

export default function NotificationSettingsScreen() {
  const { colors } = useTheme()
  const { lang } = useLang()
  const tr = lang !== 'en'
  const bottomPadding = useBottomTabPadding()

  const [userId, setUserId] = useState<string | null>(null)
  const [push, setPush] = useState<PushPreferences | null>(null)
  const [email, setEmail] = useState<EmailPreferences>(DEFAULT_EMAIL_PREFERENCES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [osGranted, setOsGranted] = useState<boolean | null>(null)
  // Tercihler okunamadiginda ekran, kapali anahtarlarla dolu bir form
  // gostermemeli: kullanici bildirimlerin kapali oldugunu sanir, sunucudaki
  // satir ise acik kalir. Bu durumda formu hic gostermiyoruz.
  const [unavailable, setUnavailable] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // Oturum dusmus ya da getUser aga ulasamamis olabilir. Ikisinde de
        // elimizde kullanicinin gercek tercihleri yok.
        setUnavailable(true)
        setLoading(false)
        return
      }
      setUserId(user.id)
      setUnavailable(false)
      const [pushPrefs, emailPrefs, permission] = await Promise.all([
        getPushPreferences(supabase, user.id),
        getEmailPreferences(supabase, user.id),
        Notifications.getPermissionsAsync(),
      ])
      setPush(pushPrefs)
      setEmail(emailPrefs)
      setOsGranted(permission.status === 'granted')
    } catch (error) {
      console.warn('Bildirim tercihleri okunamadi:', error)
      setUnavailable(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Anahtar önce ekranda çevriliyor, sonra yazılıyor; yazma başarısız olursa
   * GERİ ALINIYOR. Aksi hâlde kullanıcı bildirimi kapattığını sanır, sunucu
   * hâlâ açık bilir ve ertesi sabah bildirim gelir. Bu, ayarın hiç olmamasından
   * daha kötü: kullanıcı ayarın çalışmadığını değil, kendisinin yanlış
   * hatırladığını düşünür.
   */
  const patchPush = useCallback(
    async (patch: Partial<PushPreferences>) => {
      if (!userId || !push) return
      const previous = push
      setPush({ ...push, ...patch })
      setSaving(true)
      try {
        await updatePushPreferences(supabase, userId, patch)
      } catch (error) {
        setPush(previous)
        Alert.alert(
          tr ? 'Kaydedilemedi' : 'Not saved',
          tr ? 'Ayar sunucuya yazilamadi, eski degere donduruldu.' : 'The setting could not be saved and was reverted.',
        )
        console.warn('push tercihi yazilamadi:', error)
      } finally {
        setSaving(false)
      }
    },
    [userId, push, tr],
  )

  const patchEmail = useCallback(
    async (patch: Partial<EmailPreferences>) => {
      if (!userId) return
      const previous = email
      setEmail({ ...email, ...patch })
      setSaving(true)
      try {
        await updateEmailPreferences(supabase, userId, patch)
      } catch (error) {
        setEmail(previous)
        Alert.alert(
          tr ? 'Kaydedilemedi' : 'Not saved',
          tr ? 'Ayar sunucuya yazilamadi, eski degere donduruldu.' : 'The setting could not be saved and was reverted.',
        )
        console.warn('e-posta tercihi yazilamadi:', error)
      } finally {
        setSaving(false)
      }
    },
    [userId, email, tr],
  )

  const emailHour = (time: string): number => {
    const parsed = Number(time.split(':')[0])
    return Number.isFinite(parsed) ? Math.min(23, Math.max(0, parsed)) : 8
  }

  if (loading) {
    return (
      <ScreenBackground>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={palette.accent} />
        </View>
      </ScreenBackground>
    )
  }

  // Tercihler okunamadi. Varsayilanlarla dolu bir form gostermek burada yanlis
  // olurdu: anahtarlar kullanicinin gercek ayarini degil, uydurdugumuz bir
  // degeri gosterir ve dokunuldugunda hicbir yere yazilamaz.
  if (unavailable) {
    return (
      <ScreenBackground>
        <View style={{ flex: 1, padding: spacing[5], paddingTop: spacing[6] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[5] }}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, flex: 1 }}>
              {tr ? 'Bildirimler' : 'Notifications'}
            </Text>
          </View>
          <GlassCard>
            <View style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' }}>
              <Ionicons name="cloud-offline-outline" size={20} color={palette.warning} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                  {tr ? 'Ayarlar yuklenemedi' : 'Settings could not be loaded'}
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 4, lineHeight: 18 }}>
                  {tr
                    ? 'Baglantini kontrol et. Oturumun kapandiysa tekrar giris yapman gerekebilir. Mevcut bildirim ayarlarin degismedi.'
                    : 'Check your connection. If your session expired you may need to sign in again. Your existing notification settings are unchanged.'}
                </Text>
                <View style={{ marginTop: spacing[3] }}>
                  <Button
                    label={tr ? 'Tekrar Dene' : 'Try again'}
                    variant="secondary"
                    onPress={() => {
                      setLoading(true)
                      void load()
                    }}
                  />
                </View>
              </View>
            </View>
          </GlassCard>
        </View>
      </ScreenBackground>
    )
  }

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={{ padding: spacing[5], paddingBottom: bottomPadding }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[5] }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary, flex: 1 }}>
            {tr ? 'Bildirimler' : 'Notifications'}
          </Text>
          {saving && <ActivityIndicator size="small" color={palette.accent} />}
        </View>

        {/* Cihaz izni kapalıysa buradaki hiçbir ayar bildirim ürettirmez.
            Ayarları açık görüp bildirim alamamak en kafa karıştırıcı durum,
            o yüzden en üstte söylüyoruz. */}
        {osGranted === false && (
          <GlassCard style={{ marginBottom: spacing[5], borderColor: `${palette.warning}60`, borderWidth: 1 }}>
            <View style={{ flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' }}>
              <Ionicons name="alert-circle-outline" size={20} color={palette.warning} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
                  {tr ? 'Cihaz bildirim izni kapalı' : 'Device notifications are off'}
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 4, lineHeight: 18 }}>
                  {tr
                    ? 'Aşağıdaki ayarlar kaydedilir ama izin verilmediği sürece bildirim gelmez.'
                    : 'The settings below are saved, but nothing can be delivered without permission.'}
                </Text>
                <View style={{ marginTop: spacing[3] }}>
                  <Button
                    label={tr ? 'İzin İste' : 'Request permission'}
                    variant="secondary"
                    onPress={() => {
                      void Notifications.requestPermissionsAsync().then(({ status }) => {
                        setOsGranted(status === 'granted')
                      })
                    }}
                  />
                </View>
              </View>
            </View>
          </GlassCard>
        )}

        <SectionTitle>{tr ? 'UYGULAMA BİLDİRİMLERİ' : 'PUSH NOTIFICATIONS'}</SectionTitle>

        <GlassCard style={{ marginBottom: spacing[4] }}>
          <ToggleRow
            icon="sunny-outline"
            title={tr ? 'Sabah özeti' : 'Morning digest'}
            subtitle={tr ? 'Günün planı ve öncelikli görevler' : 'Plan and top tasks for the day'}
            value={push?.morning_enabled ?? false}
            onValueChange={(next) => void patchPush({ morning_enabled: next })}
          />
          <HourStepper
            hour={push?.morning_hour ?? DEFAULT_PUSH_PREFERENCES.morning_hour}
            disabled={!push?.morning_enabled}
            onChange={(h) => void patchPush({ morning_hour: h })}
          />
        </GlassCard>

        <GlassCard style={{ marginBottom: spacing[4] }}>
          <ToggleRow
            icon="partly-sunny-outline"
            title={tr ? 'Öğlen kontrolü' : 'Midday check-in'}
            subtitle={tr ? 'Kalan bloklar ve kalori durumu' : 'Remaining blocks and calorie status'}
            value={push?.midday_enabled ?? false}
            onValueChange={(next) => void patchPush({ midday_enabled: next })}
          />
          <HourStepper
            hour={push?.midday_hour ?? DEFAULT_PUSH_PREFERENCES.midday_hour}
            disabled={!push?.midday_enabled}
            onChange={(h) => void patchPush({ midday_hour: h })}
          />
        </GlassCard>

        <GlassCard style={{ marginBottom: spacing[4] }}>
          <ToggleRow
            icon="moon-outline"
            title={tr ? 'Gün sonu özeti' : 'Evening summary'}
            subtitle={tr ? 'Günün beslenme ve görev özeti' : 'Nutrition and task summary'}
            value={push?.evening_enabled ?? false}
            onValueChange={(next) => void patchPush({ evening_enabled: next })}
          />
          <HourStepper
            hour={push?.evening_hour ?? DEFAULT_PUSH_PREFERENCES.evening_hour}
            disabled={!push?.evening_enabled}
            onChange={(h) => void patchPush({ evening_hour: h })}
          />
        </GlassCard>

        <GlassCard style={{ marginBottom: spacing[4] }}>
          <ToggleRow
            icon="scale-outline"
            title={tr ? 'Tartı hatırlatması' : 'Weigh-in reminder'}
            subtitle={tr ? 'O gün tartı girildiyse gelmez' : 'Skipped once you have logged today'}
            value={push?.weight_enabled ?? false}
            onValueChange={(next) => void patchPush({ weight_enabled: next })}
          />
          <HourStepper
            hour={push?.weight_hour ?? DEFAULT_PUSH_PREFERENCES.weight_hour}
            disabled={!push?.weight_enabled}
            onChange={(h) => void patchPush({ weight_hour: h })}
          />
        </GlassCard>

        <GlassCard style={{ marginBottom: spacing[5] }}>
          <ToggleRow
            icon="alarm-outline"
            title={tr ? 'Blok hatırlatması' : 'Block reminder'}
            subtitle={tr ? 'Yaklaşan zaman bloğundan önce' : 'Before an upcoming time block'}
            value={push?.block_reminder_enabled ?? false}
            onValueChange={(next) => void patchPush({ block_reminder_enabled: next })}
          />
          <View
            style={{
              flexDirection: 'row',
              gap: spacing[2],
              marginTop: spacing[3],
              opacity: push?.block_reminder_enabled ? 1 : 0.35,
            }}
          >
            {BLOCK_REMINDER_CHOICES.map((minutes) => {
              const active = push?.block_reminder_minutes === minutes
              return (
                <TouchableOpacity
                  key={minutes}
                  disabled={!push?.block_reminder_enabled}
                  onPress={() => void patchPush({ block_reminder_minutes: minutes as BlockReminderMinutes })}
                  style={{
                    paddingHorizontal: spacing[3],
                    paddingVertical: spacing[2],
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: active ? palette.accent : colors.glassBorder,
                    backgroundColor: active ? `${palette.accent}22` : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontSize: fontSize.sm,
                      fontWeight: active ? fontWeight.semibold : fontWeight.medium,
                      color: active ? palette.accent : colors.textSecondary,
                    }}
                  >
                    {minutes} {tr ? 'dk' : 'min'}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </GlassCard>

        <SectionTitle>{tr ? 'E-POSTA' : 'EMAIL'}</SectionTitle>

        <GlassCard style={{ marginBottom: spacing[4] }}>
          <ToggleRow
            icon="mail-outline"
            title={tr ? 'Sabah e-postası' : 'Morning email'}
            subtitle={tr ? 'Günün planı e-posta olarak' : 'The plan for the day, by email'}
            value={email.morning_enabled}
            onValueChange={(next) => void patchEmail({ morning_enabled: next })}
          />
          <HourStepper
            hour={emailHour(email.morning_time)}
            disabled={!email.morning_enabled}
            onChange={(h) => void patchEmail({ morning_time: `${String(h).padStart(2, '0')}:00` })}
          />
        </GlassCard>

        <GlassCard style={{ marginBottom: spacing[5] }}>
          <ToggleRow
            icon="mail-open-outline"
            title={tr ? 'Akşam e-postası' : 'Evening email'}
            subtitle={tr ? 'Gün sonu özeti e-posta olarak' : 'End-of-day summary, by email'}
            value={email.evening_enabled}
            onValueChange={(next) => void patchEmail({ evening_enabled: next })}
          />
          <HourStepper
            hour={emailHour(email.evening_time)}
            disabled={!email.evening_enabled}
            onChange={(h) => void patchEmail({ evening_time: `${String(h).padStart(2, '0')}:00` })}
          />
        </GlassCard>

        {/* Saat dilimi burada yalnızca GÖSTERİLİYOR: cihazın saat diliminden
            otomatik ayarlanıyor. Elle değiştirilebilir olsaydı, seyahat eden
            kullanıcı iki kaynak arasında sıkışır ve yanlış saatte bildirim
            alırdı. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], justifyContent: 'center' }}>
          <Ionicons name="globe-outline" size={14} color={colors.textSubtle} />
          <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle }}>
            {tr ? 'Saatler bu dilime göre: ' : 'Times use: '}
            {push?.timezone ?? 'Europe/Istanbul'}
          </Text>
        </View>
      </ScrollView>
    </ScreenBackground>
  )
}
