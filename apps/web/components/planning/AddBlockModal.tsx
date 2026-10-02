'use client'

import { BLOCK_TYPE_COLORS, type BlockType } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'
import type { PlanningBlockEditor } from '@/lib/hooks/usePlanningBlockEditor'
import { RecurrencePicker } from '@/components/planning/RecurrencePicker'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface AddBlockModalProps {
  /** usePlanningBlockEditor'ın döndürdüğü durum; PlanningView'da tutulur. */
  editor: PlanningBlockEditor
}

/** Blok ekleme penceresi: saat, tip, etiket ve tekrar seçimi. */
export function AddBlockModal({ editor }: AddBlockModalProps) {
  const { t } = useLang()
  const {
    showAddBlock, setShowAddBlock,
    newBlockTime, setNewBlockTime, newBlockEnd, setNewBlockEnd,
    newBlockLabel, setNewBlockLabel, newBlockType, setNewBlockType,
    recurrence, setRecurrence, savingBlock, handleAddBlock,
  } = editor

  return (
    <Modal open={showAddBlock} onClose={() => setShowAddBlock(false)} title={t.plan_add_block_title} size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label={t.plan_start} type="time" value={newBlockTime} onChange={(e) => setNewBlockTime(e.target.value)} />
          <Input label={t.plan_end} type="time" value={newBlockEnd} onChange={(e) => setNewBlockEnd(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-primary">{t.plan_block_type}</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BLOCK_TYPE_COLORS) as BlockType[]).map((type) => (
              <button key={type} onClick={() => setNewBlockType(type)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${newBlockType === type ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`}>
                {t[`review_type_${type}`]}
              </button>
            ))}
          </div>
        </div>
        <Input label={t.plan_label} value={newBlockLabel} onChange={(e) => setNewBlockLabel(e.target.value)} placeholder={t.plan_label_placeholder} />

        <RecurrencePicker value={recurrence} onChange={setRecurrence} />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowAddBlock(false)}>{t.plan_cancel}</Button>
          <Button size="sm" onClick={() => void handleAddBlock()} disabled={savingBlock}>{recurrence.enabled ? t.plan_add_repeat : t.plan_add}</Button>
        </div>
      </div>
    </Modal>
  )
}
