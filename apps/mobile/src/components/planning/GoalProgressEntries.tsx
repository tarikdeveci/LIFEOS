import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Keyboard, InputAccessoryView, Platform } from 'react-native'
import { useGoalStore, type Goal } from '@lifeos/shared'
import { useLang } from '@/src/contexts/LangContext'
import { useTheme } from '@/src/contexts/ThemeContext'
import { supabase } from '@/src/lib/supabase'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

interface GoalProgressEntriesProps { goal: Goal; userId: string }

export function GoalProgressEntries({ goal, userId }: GoalProgressEntriesProps) {
  const { t } = useLang()
  const { colors } = useTheme()
  const { entries, logProgress, removeEntry } = useGoalStore()
  const [draft, setDraft] = useState({ open: false, expanded: false, amount: '1' })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recent = entries.filter((e) => e.goal_id === goal.id)
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at))
  const amount = Number(draft.amount.replace(',', '.'))
  const valid = Number.isFinite(amount) && amount > 0 && amount <= 100000
  const accessoryId = `goal-progress-${goal.id}`

  const save = async () => {
    if (busy) return
    if (!valid) { setError(t.goal_progress_invalid); return }
    setBusy('save')
    setError(null)
    try {
      await logProgress(supabase, userId, goal.id, amount)
      Keyboard.dismiss()
      setDraft({ open: false, expanded: true, amount: '1' })
    } catch { setError(t.goal_progress_error) } finally { setBusy(null) }
  }

  const remove = async (id: string) => {
    if (busy) return
    setBusy(id)
    setError(null)
    try { await removeEntry(supabase, id) } catch { setError(t.goal_progress_error) } finally { setBusy(null) }
  }

  return (
    <View style={{ marginTop: spacing[2], gap: spacing[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[3] }}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t.goal_log_progress}
          accessibilityState={{ expanded: draft.open }} hitSlop={8}
          onPress={() => setDraft((d) => ({ ...d, open: !d.open }))}>
          <Text style={{ color: palette.accent, fontSize: fontSize.xs }}>+ {t.goal_log_progress}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: draft.expanded }} hitSlop={8}
          onPress={() => setDraft((d) => ({ ...d, expanded: !d.expanded }))}>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{draft.expanded ? '▾' : '▸'} {t.goal_progress_entries}</Text>
        </TouchableOpacity>
      </View>
      {draft.open && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
          <TextInput value={draft.amount} keyboardType="decimal-pad" accessibilityLabel={t.goal_progress_amount}
            editable={busy === null} onChangeText={(amount) => setDraft((d) => ({ ...d, amount }))}
            returnKeyType="done" onSubmitEditing={() => void save()} inputAccessoryViewID={accessoryId}
            style={{ width: 80, padding: spacing[2], borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.textPrimary }} />
          <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{goal.unit}</Text>
          <TouchableOpacity accessibilityRole="button" disabled={busy !== null || !valid} onPress={() => void save()}
            style={{ padding: spacing[2], opacity: busy !== null || !valid ? 0.4 : 1 }}>
            <Text style={{ color: palette.accent }}>{t.goal_progress_save}</Text>
          </TouchableOpacity>
          {/* iOS sayı klavyesinde kapatma tuşu yok: kaydet klavyenin üstünde de dursun */}
          {Platform.OS === 'ios' && (
            <InputAccessoryView nativeID={accessoryId}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing[4], padding: spacing[2], paddingHorizontal: spacing[4], backgroundColor: colors.bgSurface, borderTopWidth: 1, borderTopColor: colors.border }}>
                <TouchableOpacity accessibilityRole="button" hitSlop={8} onPress={Keyboard.dismiss}>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.base }}>{t.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" hitSlop={8} disabled={busy !== null || !valid} onPress={() => void save()}>
                  <Text style={{ color: palette.accent, fontSize: fontSize.base, fontWeight: fontWeight.semibold, opacity: busy !== null || !valid ? 0.4 : 1 }}>{t.goal_progress_save}</Text>
                </TouchableOpacity>
              </View>
            </InputAccessoryView>
          )}
        </View>
      )}
      {busy !== null && <ActivityIndicator size="small" color={palette.accent} />}
      {error && <Text accessibilityRole="alert" style={{ color: palette.danger, fontSize: fontSize.xs }}>{error}</Text>}
      {draft.expanded && (
        <View style={{ gap: spacing[2] }}>
          {recent.length === 0 && <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{t.goal_progress_empty}</Text>}
          {recent.map((entry) => (
            <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}>
              <Text style={{ flex: 1, color: colors.textMuted, fontSize: fontSize.xs }}>{entry.entry_date}  +{entry.amount} {goal.unit}</Text>
              <TouchableOpacity accessibilityRole="button" disabled={busy !== null || entry.id.startsWith('pending-')}
                accessibilityLabel={`${t.goal_progress_remove}: ${entry.entry_date}, ${entry.amount} ${goal.unit ?? ''}`}
                onPress={() => void remove(entry.id)} hitSlop={8}>
                <Text style={{ color: palette.danger, fontSize: fontSize.xs }}>{t.goal_progress_remove}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
