import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import type { Integration, IntegrationProvider } from '@lifeos/shared'
import { deleteIntegration, getIntegrations, importExternalTasks } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { readOpenReminders } from '@/src/utils/remindersImport'
import { ScreenBackground } from '@/src/components/ui/ScreenBackground'
import { GlassCard } from '@/src/components/ui/GlassCard'
import { Button } from '@/src/components/ui/Button'
import { Input } from '@/src/components/ui/Input'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { useBottomTabPadding } from '@/src/hooks/useBottomTabPadding'
import { palette, fontSize, fontWeight, spacing } from '@/src/theme/tokens'

const WEB_BASE = 'https://lifeos.tr'

const PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  google_calendar: 'Google Takvim', jira: 'Jira', slack: 'Slack', notion: 'Notion',
  todoist: 'Todoist', ticktick: 'TickTick', microsoft_todo: 'Microsoft To Do',
}

/** Bağlı hesaplar ve tek seferlik içe aktarma (Apple Hatırlatıcılar, Todoist). */
export default function IntegrationsScreen() {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const bottomPadding = useBottomTabPadding()
  const [userId, setUserId] = useState<string | null>(null)
  const [items, setItems] = useState<Integration[] | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    try { setItems(await getIntegrations(supabase, user.id)) } catch { setItems([]) }
  }, [])

  useEffect(() => { void load() }, [load])

  const done = (r: { created: number; updated: number }) =>
    Alert.alert(t.integ_import_done.replace('{created}', String(r.created)).replace('{updated}', String(r.updated)))

  const importReminders = async () => {
    if (!userId) return
    setBusy('reminders')
    try {
      const items = await readOpenReminders()
      if (items === 'denied') { Alert.alert(t.integ_reminders_denied); return }
      done(await importExternalTasks(supabase, userId, 'apple_reminders', items))
    } catch { Alert.alert(t.integ_import_error) }
    finally { setBusy(null) }
  }

  const importTodoist = async () => {
    setBusy('todoist')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('no session')
      const res = await fetch(`${WEB_BASE}/api/import/todoist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ token: token.trim() }),
      })
      if (res.status === 400 || res.status === 401) { Alert.alert(t.integ_todoist_bad_token); return }
      if (!res.ok) throw new Error(String(res.status))
      setToken('')
      done((await res.json()) as { created: number; updated: number })
    } catch { Alert.alert(t.integ_import_error) }
    finally { setBusy(null) }
  }

  const disconnect = (item: Integration) => {
    Alert.alert(t.integ_disconnect_confirm, undefined, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: t.integ_disconnect, style: 'destructive', onPress: async () => {
          try {
            await deleteIntegration(supabase, item.id)
            setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? null)
          } catch { Alert.alert(t.integ_import_error) }
        },
      },
    ])
  }

  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  const label = { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.textPrimary } as const
  const hint = { fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 } as const

  return (
    <ScreenBackground>
      <ScrollView contentContainerStyle={{ padding: spacing[5], paddingBottom: bottomPadding }} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[2] }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.textPrimary }}>{t.integ_title}</Text>
        </View>
        <Text style={[hint, { marginBottom: spacing[5] }]}>{t.integ_subtitle}</Text>

        <GlassCard style={{ marginBottom: spacing[4] }}>
          <Text style={[label, { marginBottom: spacing[3] }]}>{t.integ_connected}</Text>
          {items !== null && items.length === 0 && <Text style={hint}>{t.integ_none}</Text>}
          {items?.map((item) => (
            <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>
                  {PROVIDER_LABELS[item.provider]}{item.account_label ? ` · ${item.account_label}` : ''}
                </Text>
                <Text style={{ fontSize: fontSize.xs, color: item.status === 'active' ? colors.textSubtle : palette.warning }}>
                  {item.status !== 'active' ? t.integ_status_error
                    : item.last_synced_at ? t.integ_last_sync.replace('{date}', new Date(item.last_synced_at).toLocaleString(locale))
                      : t.integ_never_synced}
                </Text>
              </View>
              <Button label={t.integ_disconnect} onPress={() => disconnect(item)} size="sm" variant="ghost" />
            </View>
          ))}
        </GlassCard>

        <GlassCard>
          <Text style={[label, { marginBottom: spacing[4] }]}>{t.integ_import_title}</Text>

          {Platform.OS === 'ios' && (
            <View style={{ gap: spacing[2], marginBottom: spacing[5] }}>
              <Text style={{ ...label, fontSize: fontSize.sm }}>{t.integ_reminders}</Text>
              <Text style={hint}>{t.integ_reminders_hint}</Text>
              <Button label={t.integ_reminders_btn} onPress={() => void importReminders()} loading={busy === 'reminders'} variant="secondary" />
            </View>
          )}

          <View style={{ gap: spacing[2], marginBottom: spacing[5] }}>
            <Text style={{ ...label, fontSize: fontSize.sm }}>{t.integ_todoist}</Text>
            <Text style={hint}>{t.integ_todoist_hint}</Text>
            <Input value={token} onChangeText={setToken} placeholder={t.integ_todoist_placeholder}
              secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <Button label={t.integ_todoist_btn} onPress={() => void importTodoist()} loading={busy === 'todoist'}
              disabled={token.trim().length < 20} variant="secondary" />
          </View>

          <Text style={hint}>{t.integ_ticktick_hint}</Text>
        </GlassCard>
      </ScrollView>
    </ScreenBackground>
  )
}
