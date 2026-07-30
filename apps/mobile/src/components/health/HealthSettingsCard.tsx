import { useState } from 'react'
import { View, Text, TouchableOpacity, Switch, Alert, Platform, Linking } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { formatSteps, formatSleepDuration } from '@lifeos/shared'
import { GlassCard } from '../ui/GlassCard'
import { useHealthStore } from '../../stores/healthStore'
import { useTheme } from '../../contexts/ThemeContext'
import { useLang } from '../../contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '../../theme/tokens'

interface Props {
  userId: string | null
}

const STEP_GOALS = [6000, 8000, 10000, 12000]
const SLEEP_GOALS = [390, 420, 450, 480] // 6.5s, 7s, 7.5s, 8s

/**
 * Profil ekranındaki sağlık ayarları kartı. Bağlı değilken tek "Bağla" butonu,
 * bağlıyken hedefler ve seçenekler.
 */
export function HealthSettingsCard({ userId }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const { available, settings, isConnecting, isSyncing, connect, updateSettings, sync } = useHealthStore()
  const [expanded, setExpanded] = useState(false)

  const enabled = settings?.enabled ?? false

  async function handleConnect() {
    if (!userId) return
    const ok = await connect(userId)
    if (!ok) {
      Alert.alert(
        t.health_title,
        available === false ? t.health_unavailable : t.health_permission_denied,
      )
    } else {
      setExpanded(true)
    }
  }

  function openSystemSettings() {
    if (Platform.OS === 'ios') {
      void Linking.openURL('x-apple-health://')
        .catch(() => void Linking.openURL('app-settings:'))
    } else {
      // Health Connect ayar ekranı
      void Linking.sendIntent?.('android.health.connect.action.HEALTH_CONNECT_SETTINGS')
        .catch(() => void Linking.openSettings())
    }
  }

  async function toggleBudget(value: boolean) {
    if (!userId) return
    try {
      await updateSettings(userId, { add_active_energy_to_budget: value })
    } catch {
      Alert.alert(t.error, 'Ayar kaydedilemedi')
    }
  }

  async function setStepGoal(goal: number) {
    if (!userId) return
    try {
      await updateSettings(userId, { step_goal: goal })
    } catch {
      Alert.alert(t.error, 'Ayar kaydedilemedi')
    }
  }

  async function setSleepGoal(goal: number) {
    if (!userId) return
    try {
      await updateSettings(userId, { sleep_goal_minutes: goal })
    } catch {
      Alert.alert(t.error, 'Ayar kaydedilemedi')
    }
  }

  async function disconnect() {
    if (!userId) return
    try {
      await updateSettings(userId, { enabled: false })
      setExpanded(false)
    } catch {
      Alert.alert(t.error, 'Ayar kaydedilemedi')
    }
  }

  return (
    <GlassCard style={{ marginBottom: spacing[4] }}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => enabled && setExpanded((e) => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
      >
        <Ionicons name="heart-outline" size={18} color={palette.danger} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary }}>
            {t.health_title}
          </Text>
          <Text style={{ fontSize: fontSize.xs, color: enabled ? palette.success : colors.textMuted, marginTop: 2 }}>
            {enabled ? `✓ ${t.health_connected}` : t.health_connect}
          </Text>
        </View>
        {enabled && <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSubtle} />}
      </TouchableOpacity>

      {!enabled ? (
        <>
          <Text style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing[3], lineHeight: 20 }}>
            {t.health_connect_desc}
          </Text>
          <TouchableOpacity
            onPress={handleConnect}
            disabled={isConnecting}
            style={{ marginTop: spacing[3], paddingVertical: spacing[3], borderRadius: radius.lg, backgroundColor: palette.accent, alignItems: 'center', opacity: isConnecting ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: '#fff' }}>
              {isConnecting ? t.health_syncing : t.health_connect}
            </Text>
          </TouchableOpacity>
        </>
      ) : expanded ? (
        <View style={{ marginTop: spacing[4], gap: spacing[4] }}>
          {/* Adım hedefi */}
          <View>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary, marginBottom: spacing[2] }}>
              {t.health_step_goal}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              {STEP_GOALS.map((goal) => {
                const active = settings?.step_goal === goal
                return (
                  <TouchableOpacity
                    key={goal}
                    onPress={() => setStepGoal(goal)}
                    style={{ flex: 1, paddingVertical: spacing[2], borderRadius: radius.md, alignItems: 'center', backgroundColor: active ? `${palette.accent}18` : colors.glassInner, borderWidth: 1, borderColor: active ? palette.accent : colors.border }}
                  >
                    <Text style={{ fontSize: fontSize.xs, fontWeight: active ? fontWeight.bold : fontWeight.regular, color: active ? palette.accent : colors.textMuted }}>
                      {formatSteps(goal, lang)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Uyku hedefi */}
          <View>
            <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary, marginBottom: spacing[2] }}>
              {t.health_sleep_goal}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing[2] }}>
              {SLEEP_GOALS.map((goal) => {
                const active = settings?.sleep_goal_minutes === goal
                return (
                  <TouchableOpacity
                    key={goal}
                    onPress={() => setSleepGoal(goal)}
                    style={{ flex: 1, paddingVertical: spacing[2], borderRadius: radius.md, alignItems: 'center', backgroundColor: active ? `${palette.accent}18` : colors.glassInner, borderWidth: 1, borderColor: active ? palette.accent : colors.border }}
                  >
                    <Text style={{ fontSize: fontSize.xs, fontWeight: active ? fontWeight.bold : fontWeight.regular, color: active ? palette.accent : colors.textMuted }}>
                      {formatSleepDuration(goal, lang)}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {/* Yakılanı bütçeye ekle */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textSecondary }}>
                {t.health_burn_to_budget}
              </Text>
              <Text style={{ fontSize: fontSize.xs, color: colors.textSubtle, marginTop: 2 }}>
                {t.health_burn_to_budget_desc}
              </Text>
            </View>
            <Switch
              value={settings?.add_active_energy_to_budget ?? false}
              onValueChange={toggleBudget}
              trackColor={{ true: palette.accent, false: colors.border }}
            />
          </View>

          {/* Aksiyonlar */}
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <TouchableOpacity
              onPress={() => userId && sync(userId)}
              disabled={isSyncing}
              style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: spacing[3], borderRadius: radius.md, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="sync-outline" size={15} color={palette.accent} />
              <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: palette.accent }}>
                {isSyncing ? t.health_syncing : t.health_sync_now}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openSystemSettings}
              style={{ paddingHorizontal: spacing[4], justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.glassInner, borderWidth: 1, borderColor: colors.border }}
            >
              <Ionicons name="settings-outline" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={disconnect} style={{ alignItems: 'center', paddingVertical: spacing[2] }}>
            <Text style={{ fontSize: fontSize.sm, color: palette.danger }}>{t.health_disconnect}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </GlassCard>
  )
}
