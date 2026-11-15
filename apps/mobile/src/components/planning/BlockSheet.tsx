import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, Alert } from 'react-native'
import { addMinutesToClock, nextSlotTime, usePlanningStore, type BlockType, type TimeBlock } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'
import { promptPushAfterFirstBlock } from '@/src/notifications/firstBlockPrompt'
import { Input } from '@/src/components/ui/Input'
import { TimeField } from '@/src/components/ui/PickerField'
import { Button } from '@/src/components/ui/Button'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius, MIN_TOUCH } from '@/src/theme/tokens'

interface Props {
  /** null: kapalı; 'new': yeni blok; blok: o bloğu düzenler. */
  target: TimeBlock | 'new' | null
  userId: string | null
  date: string
  blockColors: Record<BlockType, string>
  blockLabels: Record<BlockType, string>
  onClose: () => void
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

interface Draft { label: string; start_time: string; end_time: string; block_type: BlockType }

/**
 * Yeni blok taslağı. Saat sabit değil, o anki yerel saatten türetilir: sabit
 * 09:00 sabah dışında plan yapan herkese iki alanı elle sildiriyordu.
 */
function emptyDraft(): Draft {
  const start = nextSlotTime()
  return { label: '', start_time: start, end_time: addMinutesToClock(start, 60), block_type: 'focus' }
}

function draftOf(block: TimeBlock): Draft {
  return { label: block.label ?? '', start_time: block.start_time.slice(0, 5), end_time: block.end_time.slice(0, 5), block_type: block.block_type }
}

/**
 * Blok ekleme ve düzenleme. Kaydet tek yazma noktası; düzenlemede Sil onayla. Hata formda
 * görünür, girdiler korunur; yazılamayan değişikliği store yerelde geri alır.
 */
export function BlockSheet({ target, userId, date, blockColors, blockLabels, onClose }: Props) {
  const { colors } = useTheme()
  const { t } = useLang()
  const { addTimeBlock, updateTimeBlock, removeTimeBlock } = usePlanningStore()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const editing = target !== null && target !== 'new' ? target : null

  // Her açışta taslak yeniden kurulur: uygulama saatlerce açık kalabilir, saat eskimesin.
  useEffect(() => {
    setError(null)
    if (target === 'new') setDraft(emptyDraft())
    else if (target) setDraft(draftOf(target))
  }, [target])

  // Yazma sürerken kapatılmaz: geç dönen istek sonradan açılan başka bir formu kapatıyordu.
  const close = () => { if (!saving) onClose() }

  async function handleSave() {
    if (!userId || saving) return
    // Boş başlık ve hatalı saat sessizce reddedilmez; ağ hatasıyla aynı mesajı da almaz.
    const invalid = !draft.label.trim() ? t.plan_err_name_required
      : !TIME_RE.test(draft.start_time) || !TIME_RE.test(draft.end_time) ? t.plan_err_time_invalid
      : draft.end_time === draft.start_time ? t.plan_err_end_after_start
      : null
    if (invalid) { setError(invalid); return }
    setError(null)
    const values = {
      label: draft.label.trim(),
      start_time: draft.start_time + ':00',
      end_time: draft.end_time + ':00',
      block_type: draft.block_type,
    }
    setSaving(true)
    try {
      if (editing) await updateTimeBlock(supabase, editing.id, values)
      else {
        await addTimeBlock(supabase, userId, { date, ...values })
        // Bildirim izni ilk kaydedilen blokta, bir kez istenir.
        void promptPushAfterFirstBlock()
      }
      onClose()
    } catch {
      setError(editing ? t.plan_block_update_error : t.plan_block_add_error)
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete() {
    if (!editing) return
    Alert.alert(t.plan_block_delete_q, editing.label ?? blockLabels[editing.block_type], [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete, style: 'destructive',
        onPress: async () => {
          setSaving(true)
          try { await removeTimeBlock(supabase, editing.id); onClose() }
          catch { setError(t.ux_plan_delete_error) }
          finally { setSaving(false) }
        },
      },
    ])
  }

  return (
    <BottomSheet visible={target !== null} onClose={close} title={editing ? t.ux_plan_edit_block : t.plan_new_block} scrollable>
      <View style={{ gap: spacing[3] }}>
        <Input label={t.field_title} value={draft.label} onChangeText={(v) => setDraft((d) => ({ ...d, label: v }))} placeholder={t.plan_block_placeholder} autoFocus={!editing} />
        <View style={{ flexDirection: 'row', gap: spacing[3] }}>
          <TimeField label={t.field_start} value={draft.start_time} onChange={(v) => setDraft((d) => ({ ...d, start_time: v }))} defaultTime="09:00" containerStyle={{ flex: 1 }} />
          <TimeField label={t.field_end} value={draft.end_time} onChange={(v) => setDraft((d) => ({ ...d, end_time: v }))} defaultTime={draft.start_time || '10:00'} containerStyle={{ flex: 1 }} />
        </View>
        <View>
          <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: colors.textMuted, marginBottom: spacing[2] }}>{t.misc_type}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
            {(Object.keys(blockLabels) as BlockType[]).map((type) => {
              const selected = draft.block_type === type
              return (
                <TouchableOpacity
                  key={type}
                  onPress={() => setDraft((d) => ({ ...d, block_type: type }))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={{ minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: spacing[3], borderRadius: radius.md, backgroundColor: selected ? blockColors[type] : colors.glassInner, borderWidth: 1, borderColor: selected ? blockColors[type] : colors.border }}
                >
                  <Text style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: selected ? '#fff' : colors.textMuted }}>{blockLabels[type]}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
        {error && <Text accessibilityLiveRegion="polite" style={{ fontSize: fontSize.sm, color: palette.danger }}>{error}</Text>}
        <Button
          label={editing ? t.save : (saving ? t.adding : t.add)}
          onPress={() => void handleSave()}
          loading={saving}
          fullWidth
          style={{ marginTop: spacing[2] }}
        />
        {editing && <Button label={t.delete} variant="ghost" onPress={confirmDelete} disabled={saving} fullWidth />}
      </View>
    </BottomSheet>
  )
}
