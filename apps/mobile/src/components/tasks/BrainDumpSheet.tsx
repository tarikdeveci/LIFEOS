import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity } from 'react-native'
import Ionicons from '@expo/vector-icons/Ionicons'
import {
  addMinutesToClock,
  BRAIN_DUMP_MAX_CHARS,
  DEFAULT_TASK_MINUTES,
  parseBrainDump,
  relativeDateLabel,
  sanitizeBrainDumpItems,
  todayDate,
  useTaskStore,
  type QuickParseResult,
} from '@lifeos/shared'
import { createTimeBlocks } from '@lifeos/shared/supabase'
import { supabase } from '@/src/lib/supabase'
import { aiErrorMessage, callAiSuggest } from '@/src/lib/ai'
import { BottomSheet } from '@/src/components/ui/BottomSheet'
import { Button } from '@/src/components/ui/Button'
import { useTheme } from '@/src/contexts/ThemeContext'
import { useLang } from '@/src/contexts/LangContext'
import { palette, fontSize, fontWeight, spacing, radius } from '@/src/theme/tokens'

interface Props {
  visible: boolean
  onClose: () => void
  userId: string | null
  isPro: boolean
  /** Pro değilse paywall uyarısını gösterir ve false döner. */
  requirePro: (source?: string) => boolean
}

/** `taskId`: görev yazıldı ama zaman bloğu düştüyse görev burada kalır, tekrar denemede yalnız blok yazılır. */
interface Candidate extends QuickParseResult { keep: boolean; taskId?: string; taskTitle?: string }

/** Metin, aday listesi, meşgul ve hata durumu tek yerde; bileşen sadece çizer. */
function useBrainDump(userId: string | null, errorText: string, onDone: () => void) {
  const { addTask } = useTaskStore()
  const [text, setText] = useState('')
  const [items, setItems] = useState<Candidate[] | null>(null)
  const [busy, setBusy] = useState<'ai' | 'save' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const toCandidates = (list: QuickParseResult[]) => list.map((r) => ({ ...r, keep: true }))

  function reset() { setText(''); setItems(null); setError(null); setBusy(null) }

  function splitFree() { setError(null); setItems(toCandidates(parseBrainDump(text, todayDate()))) }

  async function splitWithAi() {
    setBusy('ai')
    setError(null)
    try {
      const data = await callAiSuggest<{ tasks?: unknown }>({ type: 'brain_dump', user_message: text })
      setItems(toCandidates(sanitizeBrainDumpItems(data.tasks)))
    } catch (err) {
      setError(aiErrorMessage(err, errorText))
    } finally {
      setBusy(null)
    }
  }

  function patch(index: number, change: Partial<Candidate>) {
    setItems((list) => list?.map((x, j) => (j === index ? { ...x, ...change } : x)) ?? null)
  }

  async function save() {
    if (!userId || !items) return
    setBusy('save')
    setError(null)
    // Kaydedilen satırlar listeden düşer: yarıda hata olursa tekrar dokunuş
    // aynı görevleri ikinci kez eklemez.
    let remaining = items
    try {
      for (const item of items) {
        const title = item.title.trim()
        if (item.keep && title) {
          const minutes = item.estimated_minutes ?? DEFAULT_TASK_MINUTES
          const task = item.taskId ? { id: item.taskId, title: item.taskTitle ?? title } : await addTask(supabase, userId, {
            title,
            ...(item.tags.length > 0 && { tags: item.tags }),
            ...(item.scheduled_date && { scheduled_date: item.scheduled_date, status: 'planned' as const }),
            ...(item.due_date && { due_date: item.due_date }),
            ...(item.estimated_minutes && { estimated_minutes: item.estimated_minutes }),
            ...(item.effort_score !== undefined && { effort_score: item.effort_score }),
          })
          // Görev yazıldı: yeniden eklenmesin. Blok yazımı düşerse satır görevle birlikte listede
          // kalır ve tekrar denemede yalnız blok yazılır.
          const written: Candidate = { ...item, taskId: task.id, taskTitle: task.title }
          remaining = remaining.map((x) => (x === item ? written : x))
          if (item.start_time && item.scheduled_date) {
            await createTimeBlocks(supabase, userId, [{
              date: item.scheduled_date, start_time: item.start_time,
              end_time: addMinutesToClock(item.start_time, minutes),
              block_type: 'task', label: task.title, task_id: task.id,
            }])
          }
          remaining = remaining.filter((x) => x !== written)
        }
      }
      reset()
      onDone()
    } catch {
      setItems(remaining)
      setError(errorText)
    } finally {
      setBusy(null)
    }
  }

  return { text, setText, items, setItems, busy, error, reset, splitFree, splitWithAi, patch, save }
}

/** Aklındakileri dök: yaz ya da klavyenin mikrofonuyla konuş, görevlere bölünsün, onayla ve ekle. */
export function BrainDumpSheet({ visible, onClose, userId, isPro, requirePro }: Props) {
  const { colors } = useTheme()
  const { t, lang } = useLang()
  const bd = useBrainDump(userId, t.brain_error, onClose)
  const kept = bd.items?.filter((i) => i.keep && i.title.trim()).length ?? 0

  function close() { bd.reset(); onClose() }

  function handleAi() {
    if (!requirePro('brain_dump')) return
    void bd.splitWithAi()
  }

  return (
    <BottomSheet visible={visible} onClose={close} title={t.brain_title} scrollable>
      {bd.items === null ? (
        <View style={{ gap: spacing[3] }}>
          <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 18 }}>{t.brain_hint}</Text>
          <TextInput
            value={bd.text}
            onChangeText={bd.setText}
            multiline
            maxLength={BRAIN_DUMP_MAX_CHARS}
            placeholder={t.brain_placeholder}
            placeholderTextColor={colors.textSubtle}
            textAlignVertical="top"
            style={{ minHeight: 160, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.glassInner, padding: spacing[3], fontSize: fontSize.sm, color: colors.textPrimary }}
          />
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Button label={t.brain_split} onPress={bd.splitFree} variant="secondary" disabled={!bd.text.trim()} style={{ flex: 1 }} />
            <Button
              label={`${isPro ? '' : '🔒 '}${t.brain_ai}`}
              onPress={handleAi}
              disabled={!bd.text.trim() || bd.busy !== null}
              loading={bd.busy === 'ai'}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : (
        <View style={{ gap: spacing[3] }}>
          {bd.items.length === 0 && <Text style={{ fontSize: fontSize.sm, color: colors.textMuted }}>{t.brain_empty}</Text>}
          {bd.items.map((item, i) => {
            const meta = [
              item.scheduled_date && `${relativeDateLabel(item.scheduled_date, lang)}${item.start_time ? ` ${item.start_time}` : ''}`,
              item.estimated_minutes && `${item.estimated_minutes} dk`,
              ...item.tags.map((tag) => `#${tag}`),
            ].filter(Boolean).join(' · ')
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2], borderRadius: radius.md, backgroundColor: colors.glassInner, paddingHorizontal: spacing[2], paddingVertical: spacing[2] }}>
                <TouchableOpacity onPress={() => bd.patch(i, { keep: !item.keep })} accessibilityRole="checkbox" accessibilityState={{ checked: item.keep }} hitSlop={8}>
                  <Ionicons name={item.keep ? 'checkbox' : 'square-outline'} size={20} color={item.keep ? palette.accent : colors.textSubtle} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <TextInput
                    value={item.title}
                    onChangeText={(title) => bd.patch(i, { title })}
                    style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: item.keep ? colors.textPrimary : colors.textSubtle, paddingVertical: 0 }}
                  />
                  {meta ? <Text style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{meta}</Text> : null}
                </View>
              </View>
            )
          })}
          <View style={{ flexDirection: 'row', gap: spacing[2] }}>
            <Button label={t.brain_back} onPress={() => bd.setItems(null)} variant="secondary" style={{ flex: 1 }} />
            <Button
              label={t.brain_add.replace('{n}', String(kept))}
              onPress={() => void bd.save()}
              disabled={kept === 0 || bd.busy !== null}
              loading={bd.busy === 'save'}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}
      {bd.error && <Text style={{ fontSize: fontSize.xs, color: palette.danger, marginTop: spacing[2] }}>{bd.error}</Text>}
    </BottomSheet>
  )
}
