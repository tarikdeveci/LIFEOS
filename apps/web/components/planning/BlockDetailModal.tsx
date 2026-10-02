'use client'

import Link from 'next/link'
import { BLOCK_TYPE_COLORS, type BlockType } from '@lifeos/shared'
import { useLang } from '@/lib/contexts/LangContext'
import type { PlanningBlockEditor } from '@/lib/hooks/usePlanningBlockEditor'
import { FocusBlockAction } from '@/components/planning/FocusTimer'
import { RecurrencePicker, ScopeChoice } from '@/components/planning/RecurrencePicker'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface BlockDetailModalProps {
  userId: string
  /** usePlanningBlockEditor'ın döndürdüğü durum; PlanningView'da tutulur. */
  editor: PlanningBlockEditor
}

/** Seçili bloğun detay penceresi; "Düzenle" ile aynı pencere düzenleme formuna döner. */
export function BlockDetailModal({ userId, editor }: BlockDetailModalProps) {
  const { t } = useLang()
  const {
    selectedBlock, setSelectedBlock, editingBlock, setEditingBlock,
    editBlockStart, setEditBlockStart, editBlockEnd, setEditBlockEnd,
    editBlockType, setEditBlockType, editBlockLabel, setEditBlockLabel,
    editRecurrence, setEditRecurrence, editScope, setEditScope,
    savingBlock, handleToggleBlockDone, handleSaveBlockEdit, handleDeleteBlock,
  } = editor

  return (
    <Modal open={!!selectedBlock} onClose={() => { setSelectedBlock(null); setEditingBlock(false) }}
      title={editingBlock ? t.plan_edit_block_title : t.plan_block_detail} size="sm">
      {selectedBlock && (
        <div className="space-y-4">
          {editingBlock ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input label={t.plan_start} type="time" value={editBlockStart} onChange={(e) => setEditBlockStart(e.target.value)} />
                <Input label={t.plan_end} type="time" value={editBlockEnd} onChange={(e) => setEditBlockEnd(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-primary">{t.plan_block_type}</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(BLOCK_TYPE_COLORS) as BlockType[]).map((type) => (
                    <button key={type} onClick={() => setEditBlockType(type)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${editBlockType === type ? 'bg-accent text-white' : 'bg-border/40 text-muted hover:bg-border/60'}`}>
                      {t[`review_type_${type}`]}
                    </button>
                  ))}
                </div>
              </div>
              <Input label={t.plan_label} value={editBlockLabel} onChange={(e) => setEditBlockLabel(e.target.value)} />

              {selectedBlock.routine_id ? (
                <ScopeChoice value={editScope} onChange={setEditScope} />
              ) : !selectedBlock.task_id && (
                <RecurrencePicker value={editRecurrence} onChange={setEditRecurrence} />
              )}

              <div className="flex justify-between gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingBlock(false)} disabled={savingBlock}>{t.plan_cancel}</Button>
                <Button size="sm" onClick={() => void handleSaveBlockEdit()} disabled={savingBlock}>{savingBlock ? t.plan_saving : t.plan_save}</Button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl p-4" style={{ backgroundColor: `${selectedBlock.color ?? BLOCK_TYPE_COLORS[selectedBlock.block_type]}15` }}>
                <p className="text-lg font-semibold" style={{ color: selectedBlock.color ?? BLOCK_TYPE_COLORS[selectedBlock.block_type] }}>
                  {selectedBlock.label ?? t[`review_type_${selectedBlock.block_type}`]}
                </p>
                <p className="mt-1 text-sm text-muted">{selectedBlock.start_time.slice(0, 5)} - {selectedBlock.end_time.slice(0, 5)}</p>
                <p className="mt-1 text-xs text-muted">{t.plan_block_type}: {t[`review_type_${selectedBlock.block_type}`]}</p>
                {selectedBlock.routine_id ? (
                  <p className="mt-1 text-xs font-medium text-accent">🔄 {t.plan_routine_badge}</p>
                ) : selectedBlock.is_recurring && (
                  <p className="mt-1 text-xs font-medium text-accent">🔄 {t.plan_recurring}</p>
                )}
              </div>
              {selectedBlock.block_type === 'workout' && (
                <Link href="/workout" className="flex items-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-3 py-2 text-sm font-medium text-pink-700 hover:bg-pink-100">
                  <span>{t.plan_go_workout}</span>
                </Link>
              )}
              {selectedBlock.block_type === 'meal' && (
                <Link href="/nutrition" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100">
                  <span>{t.plan_go_nutrition}</span>
                </Link>
              )}
              <FocusBlockAction block={selectedBlock} userId={userId} onStarted={() => setSelectedBlock(null)} />
              {/* Tamamlama sunucuya yazılıyor: bağlı görev varsa store onu da kapatır. */}
              {selectedBlock.completed_at ? (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-success/10 py-2.5">
                  <span className="text-sm font-semibold text-success">{t.plan_done}</span>
                  <button
                    onClick={() => void handleToggleBlockDone(selectedBlock.id, false)}
                    className="text-[10px] text-muted hover:text-primary"
                  >{t.plan_undo}</button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    void handleToggleBlockDone(selectedBlock.id, true)
                    setSelectedBlock(null)
                  }}
                  className="w-full rounded-xl bg-success/10 py-2.5 text-sm font-medium text-success hover:bg-success/20"
                >
                  {t.plan_mark_done}
                </button>
              )}
              {selectedBlock.routine_id && <ScopeChoice value={editScope} onChange={setEditScope} />}
              <div className="flex justify-between gap-2">
                <Button variant="danger" size="sm" onClick={() => void handleDeleteBlock()}>{t.plan_delete}</Button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditingBlock(true)}>{t.plan_edit}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedBlock(null)}>{t.plan_close}</Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
