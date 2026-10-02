import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import { supabase } from '@/src/lib/supabase'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

const WEB_BASE = 'https://lifeos.tr'

interface Props {
  integrationId: string
  hasSelection: boolean
  onSaved: () => void
}

interface Source { id: string; name: string }

async function authed(path: string, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('no session')
  return await fetch(`${WEB_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
  })
}

/** Notion bağlantısında senkronlanacak veritabanını seçtirir (web NotionSourcePicker ile aynı akış). */
export function NotionSourcePicker({ integrationId, hasSelection, onSaved }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const [open, setOpen] = useState(!hasSelection)
  const [sources, setSources] = useState<Source[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    if (!open || sources !== null) return
    void (async () => {
      try {
        const res = await authed(`/api/integrations/notion/sources?integration=${encodeURIComponent(integrationId)}`)
        const body = (await res.json()) as { sources?: Source[]; selected?: string | null }
        if (!res.ok) throw new Error(String(res.status))
        setSources(body.sources ?? [])
        setSelected(body.selected ?? null)
      } catch { setSources([]) }
    })()
  }, [open, sources, integrationId])

  const choose = async (id: string) => {
    setSaving(id)
    try {
      const res = await authed('/api/integrations/notion/sources', {
        method: 'POST', body: JSON.stringify({ integration: integrationId, data_source_id: id }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setSelected(id)
      setOpen(false)
      Alert.alert(t.integ_notion_saved)
      onSaved()
    } catch { Alert.alert(t.integ_import_error) }
    finally { setSaving(null) }
  }

  if (!open) {
    return (
      <TouchableOpacity onPress={() => setOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ fontSize: fontSize.xs, color: palette.accent, fontWeight: fontWeight.medium }}>{t.integ_notion_change}</Text>
      </TouchableOpacity>
    )
  }

  return (
    <View style={{ gap: spacing[2], paddingTop: spacing[1] }}>
      <Text style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{t.integ_notion_pick}</Text>
      {sources === null ? <ActivityIndicator color={palette.accent} />
        : sources.length === 0 ? <Text style={{ fontSize: fontSize.xs, color: palette.warning }}>{t.integ_notion_none}</Text>
          : sources.map((s) => (
            <TouchableOpacity key={s.id} onPress={() => void choose(s.id)} disabled={saving !== null}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: spacing[2], padding: spacing[3], borderRadius: radius.md,
                backgroundColor: s.id === selected ? `${palette.accent}18` : colors.glassInner,
              }}>
              <Text style={{ flex: 1, fontSize: fontSize.sm, color: colors.textPrimary }} numberOfLines={1}>{s.name}</Text>
              {saving === s.id && <ActivityIndicator size="small" color={palette.accent} />}
            </TouchableOpacity>
          ))}
    </View>
  )
}
