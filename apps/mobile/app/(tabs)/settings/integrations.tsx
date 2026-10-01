import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import { router } from 'expo-router'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import type { Integration, IntegrationProvider } from '@lifeos/shared'
import { deleteIntegration, getIntegrations, importExternalTasks } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { readOpenReminders } from '@/src/utils/remindersImport'
import { NotionSourcePicker } from '@/src/components/settings/NotionSourcePicker'
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

/** OAuth ile bağlanan görev kaynakları: rota slug'ı ve tablodaki sağlayıcı adı. */
const SOURCES = [
  { slug: 'jira', provider: 'jira', hint: 'integ_jira_hint' },
  { slug: 'notion', provider: 'notion', hint: 'integ_notion_hint' },
  { slug: 'microsoft', provider: 'microsoft_todo', hint: 'integ_microsoft_hint' },
  { slug: 'slack', provider: 'slack', hint: 'integ_slack_hint' },
] as const satisfies readonly { slug: string; provider: IntegrationProvider; hint: string }[]

const SLUG_PROVIDER: Record<string, IntegrationProvider> = {
  google: 'google_calendar', ...Object.fromEntries(SOURCES.map((s) => [s.slug, s.provider])),
}

/** Bağlı hesaplar, görev kaynakları ve tek seferlik içe aktarma (Apple Hatırlatıcılar, Todoist). */
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

  const authedFetch = async (path: string, body: unknown) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('no session')
    return await fetch(`${WEB_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    })
  }

  const connect = async (slug: string) => {
    const name = PROVIDER_LABELS[SLUG_PROVIDER[slug]!]
    setBusy(slug)
    try {
      const res = await authedFetch(`/api/integrations/${slug}/start`, { platform: 'mobile' })
      if (res.status === 503) { Alert.alert(t.integ_unavailable.replace('{name}', name)); return }
      const { url } = (await res.json()) as { url?: string }
      if (!res.ok || !url) throw new Error(String(res.status))
      const result = await WebBrowser.openAuthSessionAsync(url, `lifeos://integrations/${slug}`)
      if (result.type === 'success') {
        // Sunucu bağlantıyı burada yazmaz: kodu devreder, uygulama kendi oturumuyla bitirir.
        // Böylece başkasının başlattığı yetki adresi onu onaylayanın hesabını bağlayamaz.
        const { queryParams } = Linking.parse(result.url)
        const { handoff, code, status } = queryParams ?? {}
        let ok = status === 'ok'
        if (status === 'pending' && typeof handoff === 'string' && typeof code === 'string') {
          const done = await authedFetch(`/api/integrations/${slug}/complete`, { handoff, code })
          ok = done.ok && ((await done.json()) as { ok?: boolean }).ok === true
        }
        Alert.alert((ok ? t.integ_connect_ok : t.integ_connect_error).replace('{name}', name))
        await load()
      }
    } catch { Alert.alert(t.integ_connect_error.replace('{name}', name)) }
    finally { setBusy(null) }
  }

  const disconnect = (item: Integration) => {
    Alert.alert(t.integ_disconnect_confirm, undefined, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.integ_disconnect, style: 'destructive', onPress: async () => {
          try {
            if (item.provider === 'google_calendar') {
              const res = await authedFetch('/api/integrations/google/disconnect', {})
              if (!res.ok) throw new Error(String(res.status))
            } else {
              await deleteIntegration(supabase, item.id)
            }
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
            <View key={item.id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] }}>
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
              {item.provider === 'notion' && (
                <View style={{ width: '100%' }}>
                  <NotionSourcePicker integrationId={item.id} hasSelection={typeof item.settings['data_source_id'] === 'string'}
                    onSaved={() => void load()} />
                </View>
              )}
            </View>
          ))}
        </GlassCard>

        {items !== null && !items.some((i) => i.provider === 'google_calendar') && (
          <GlassCard style={{ marginBottom: spacing[4] }}>
            <View style={{ gap: spacing[2] }}>
              <Text style={label}>{t.integ_google}</Text>
              <Text style={hint}>{t.integ_google_hint}</Text>
              <Button label={t.integ_google_connect} onPress={() => void connect('google')} loading={busy === 'google'} />
            </View>
          </GlassCard>
        )}

        {items !== null && SOURCES.some((src) => !items.some((i) => i.provider === src.provider)) && (
          <GlassCard style={{ marginBottom: spacing[4] }}>
            <Text style={label}>{t.integ_sources}</Text>
            <Text style={[hint, { marginTop: spacing[1], marginBottom: spacing[3] }]}>{t.integ_sources_hint}</Text>
            {SOURCES.filter((src) => !items.some((i) => i.provider === src.provider)).map((src) => (
              <View key={src.slug} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textPrimary }}>{PROVIDER_LABELS[src.provider]}</Text>
                  <Text style={hint}>{t[src.hint]}</Text>
                </View>
                <Button label={t.integ_connect} onPress={() => void connect(src.slug)} loading={busy === src.slug} size="sm" variant="secondary" />
              </View>
            ))}
          </GlassCard>
        )}

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
