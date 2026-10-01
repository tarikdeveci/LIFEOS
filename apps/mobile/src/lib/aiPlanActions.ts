import type { TimeBlock } from '@lifeos/shared'
import { usePlanningStore } from '@lifeos/shared'
import { supabase } from '@/src/lib/supabase'

/**
 * AI planlama koçunun önerdiği blok değişiklikleri. Eskiden yanıt gelir gelmez
 * uygulanıyordu (silme dahil); artık sohbette özetlenir, kullanıcı onaylayınca yazılır.
 */
export interface AiPlanAction {
  action: 'add' | 'remove' | 'move'
  block_id?: string
  block?: Partial<TimeBlock> & { date?: string }
}

export interface KnownBlock { id: string; start_time: string; end_time: string; label: string | null }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const hhmm = (time?: string | null) => (time ?? '').slice(0, 5)

/** Eksik alanlı aksiyonlar uygulanamaz; onay özetinde sayılıp sonra sessizce atlanmasın. */
export function validAiActions(actions: AiPlanAction[] | undefined): AiPlanAction[] {
  return (actions ?? []).filter((a) => {
    if (a.action === 'remove') return !!a.block_id
    if (a.action === 'move') return !!(a.block_id && a.block?.start_time && a.block.end_time)
    if (a.action === 'add') return !!(a.block?.label && a.block.start_time && a.block.end_time && a.block.block_type)
    return false
  })
}

/** Her aksiyon için tek satır; silinen ve taşınan bloğun adı mevcut bloklardan bulunur. */
export function describeAiActions(actions: AiPlanAction[], known: KnownBlock[]): string {
  const byId = new Map(known.map((b) => [b.id, b]))
  return actions.map((a) => {
    const old = a.block_id ? byId.get(a.block_id) : undefined
    const label = a.block?.label ?? old?.label ?? ''
    if (a.action === 'remove') return `🗑 ${hhmm(old?.start_time)}-${hhmm(old?.end_time)} ${label}`.trim()
    if (a.action === 'move') return `↕ ${label} ${hhmm(old?.start_time)} → ${hhmm(a.block?.start_time)}`.trim()
    return `+ ${hhmm(a.block?.start_time)}-${hhmm(a.block?.end_time)} ${label}`.trim()
  }).join('\n')
}

/** Onaylanan aksiyonları sırayla yazar; son dokunulan günü döndürür ki ekran oraya geçsin. */
export async function applyAiActions(userId: string, actions: AiPlanAction[], fallbackDate: string): Promise<string> {
  const { addTimeBlock, removeTimeBlock, updateTimeBlock } = usePlanningStore.getState()
  let affectedDate = fallbackDate
  for (const action of actions) {
    const b = action.block
    const blockDate = typeof b?.date === 'string' && DATE_RE.test(b.date) ? b.date : fallbackDate
    if (action.action === 'remove' && action.block_id) {
      await removeTimeBlock(supabase, action.block_id)
    } else if (action.action === 'move' && action.block_id && b?.start_time && b.end_time) {
      affectedDate = blockDate
      await updateTimeBlock(supabase, action.block_id, { date: blockDate, start_time: b.start_time, end_time: b.end_time })
    } else if (action.action === 'add' && b?.label && b.start_time && b.end_time && b.block_type) {
      affectedDate = blockDate
      await addTimeBlock(supabase, userId, {
        date: blockDate, label: b.label, start_time: b.start_time, end_time: b.end_time, block_type: b.block_type,
      })
    }
  }
  return affectedDate
}
