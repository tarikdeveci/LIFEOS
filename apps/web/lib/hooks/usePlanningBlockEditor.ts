'use client'

import { useState, useCallback } from 'react'
import type { TimeBlock, CreateTimeBlockInput, UpdateTimeBlockInput } from '@lifeos/shared'
import {
  todayDate, shiftIsoDate, nextSlotTime, addMinutesToClock,
  fromDateString,
  usePlanningStore,
  useRoutineStore,
  type BlockType } from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'
import { useToast } from '@/components/ui/Toast'
import {
  initialRecurrence, recurrenceToRoutineInput,
  type RecurrenceValue, type EditScope,
} from '@/components/planning/RecurrencePicker'

interface UsePlanningBlockEditorOptions {
  userId: string
  /** Rutin serisi değişince gün ve hafta görünümünü yeniden okutur. */
  refreshAfterRoutineChange: () => void
}

/**
 * Planlama ekranındaki blok ekleme ve blok detay/düzenleme pencerelerinin durumu
 * ile kaydetme, tamamlama ve silme işlemleri. Pencereleri AddBlockModal ve
 * BlockDetailModal çizer.
 */
export function usePlanningBlockEditor({ userId, refreshAfterRoutineChange }: UsePlanningBlockEditorOptions) {
  const { date, addTimeBlock, updateTimeBlock, removeTimeBlock, setBlockDone } = usePlanningStore()
  const { routines, addRoutine, updateSeries, removeRoutine } = useRoutineStore()
  const { showToast } = useToast()
  const { t } = useLang()

  const [showAddBlock, setShowAddBlock] = useState(false)
  // Sabit '09:00' değil: o anki yerel saatin bir sonraki yarım saati. Modal her
  // açıldığında `openAddBlock` yeniden hesaplıyor: uygulama saatlerce açık kalabilir.
  const [newBlockTime, setNewBlockTime] = useState(() => nextSlotTime())
  const [newBlockEnd, setNewBlockEnd]   = useState(() => addMinutesToClock(nextSlotTime(), 60))
  const [newBlockLabel, setNewBlockLabel] = useState('')
  const [newBlockType, setNewBlockType] = useState<BlockType>('focus')

  // Tekrar (ekleme penceresi): sunucu tarafı rutin şablonu olarak kaydedilir.
  const [recurrence, setRecurrence] = useState<RecurrenceValue>(() => initialRecurrence())

  // Selected block detail / edit
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null)
  const [editingBlock, setEditingBlock]   = useState(false)
  const [editBlockStart, setEditBlockStart] = useState('')
  const [editBlockEnd, setEditBlockEnd]     = useState('')
  const [editBlockType, setEditBlockType]   = useState<BlockType>('focus')
  const [editBlockLabel, setEditBlockLabel] = useState('')
  const [editRecurrence, setEditRecurrence] = useState<RecurrenceValue>(() => initialRecurrence())
  // Rutin örneğinde düzenleme/silme kapsamı.
  const [editScope, setEditScope] = useState<EditScope>('this')
  const [savingBlock, setSavingBlock] = useState(false)

  // ── Add block ───────────────────────────────────────────────────────────────
  const handleAddBlock = useCallback(async () => {
    if (savingBlock) return
    setSavingBlock(true)
    try {
      if (recurrence.enabled) {
        if (recurrence.every !== 'daily' && recurrence.days.length === 0) { showToast(t.plan_err_pick_day, 'error'); return }
        await addRoutine(supabase, userId, recurrenceToRoutineInput(recurrence,
          { label: newBlockLabel, block_type: newBlockType, start_time: newBlockTime, end_time: newBlockEnd, date },
          t[`review_type_${newBlockType}`]))
        refreshAfterRoutineChange()
        showToast(t.plan_routine_added, 'success')
      } else {
        const input: CreateTimeBlockInput = {
          date, start_time: newBlockTime, end_time: newBlockEnd, block_type: newBlockType,
          ...(newBlockLabel && { label: newBlockLabel }),
        }
        await addTimeBlock(supabase, userId, input)
      }
      setShowAddBlock(false); setNewBlockLabel(''); setRecurrence(initialRecurrence(fromDateString(date)))
    } catch { showToast(recurrence.enabled ? t.plan_routine_error : t.plan_block_add_error, 'error') }
    finally { setSavingBlock(false) }
  }, [addTimeBlock, addRoutine, userId, date, newBlockTime, newBlockEnd, newBlockType, newBlockLabel,
      recurrence, refreshAfterRoutineChange, savingBlock, showToast, t])

  /**
   * Blok tamamlama. Açık olan detay penceresindeki kopya da güncelleniyor:
   * `selectedBlock` store'dan bağımsız bir state, aksi halde "geri al"
   * düğmesine basıldığında pencere hâlâ tamamlanmış görünüyor.
   */
  const handleToggleBlockDone = useCallback(async (blockId: string, done: boolean) => {
    try {
      await setBlockDone(supabase, blockId, done)
      setSelectedBlock((current) =>
        current && current.id === blockId
          ? { ...current, completed_at: done ? new Date().toISOString() : null }
          : current,
      )
      showToast(done ? t.plan_block_done_toast : t.plan_block_undone_toast, 'success')
    } catch {
      showToast(t.plan_block_update_error, 'error')
    }
  }, [setBlockDone, showToast, t])

  const handleSlotClick = useCallback((time: string) => {
    setNewBlockTime(time)
    // Eskiden saat+1 elle kuruluyordu; 23:00 dilimine tıklayınca '24:00' üretiyordu.
    setNewBlockEnd(addMinutesToClock(time, 60))
    setShowAddBlock(true)
  }, [])

  /** Zaman çizelgesindeki bir dilime değil, düğmeye basılarak açılan hâli. */
  const openAddBlock = useCallback(() => {
    const start = nextSlotTime()
    setNewBlockTime(start)
    setNewBlockEnd(addMinutesToClock(start, 60))
    setShowAddBlock(true)
  }, [])

  const openBlockDetail = useCallback((block: TimeBlock) => {
    setSelectedBlock(block); setEditingBlock(false)
    setEditBlockStart(block.start_time.slice(0, 5))
    setEditBlockEnd(block.end_time.slice(0, 5))
    setEditBlockType(block.block_type)
    setEditBlockLabel(block.label ?? '')
    setEditRecurrence(initialRecurrence(fromDateString(block.date)))
    setEditScope('this')
  }, [])

  // ── Save block edit ─────────────────────────────────────────────────────────
  // Rutin örneği: "sadece bu" sıradan güncelleme (tetikleyici routine_modified yapar),
  // "bu ve sonrakiler" şablonu değiştirip bu örnekten itibaren yeniden üretir.
  // Sıradan blok tekrara çevrilirse blok silinir, aynı günden başlayan rutin kurulur.
  const handleSaveBlockEdit = useCallback(async () => {
    if (!selectedBlock) return
    if (editBlockEnd <= editBlockStart) { showToast(t.plan_err_end_after_start, 'error'); return }
    setSavingBlock(true)
    try {
      if (selectedBlock.routine_id && editScope === 'following') {
        await updateSeries(supabase, selectedBlock.routine_id, {
          title: editBlockLabel.trim() || t[`review_type_${editBlockType}`],
          block_type: editBlockType, start_time: editBlockStart, end_time: editBlockEnd,
        }, selectedBlock.occurrence_date ?? selectedBlock.date)
        refreshAfterRoutineChange()
        showToast(t.plan_routine_updated, 'success')
        setSelectedBlock(null)
        return
      }
      if (!selectedBlock.routine_id && !selectedBlock.task_id && editRecurrence.enabled) {
        if (editRecurrence.every !== 'daily' && editRecurrence.days.length === 0) { showToast(t.plan_err_pick_day, 'error'); return }
        const block = { label: editBlockLabel, block_type: editBlockType, start_time: editBlockStart, end_time: editBlockEnd, date: selectedBlock.date }
        await removeTimeBlock(supabase, selectedBlock.id)
        await addRoutine(supabase, userId, recurrenceToRoutineInput(editRecurrence, block, t[`review_type_${editBlockType}`]))
        refreshAfterRoutineChange()
        showToast(t.plan_routine_added, 'success')
        setSelectedBlock(null)
        return
      }
      const updates: UpdateTimeBlockInput = {
        start_time: editBlockStart, end_time: editBlockEnd,
        block_type: editBlockType, label: editBlockLabel || undefined,
      }
      await updateTimeBlock(supabase, selectedBlock.id, updates)
      showToast(t.plan_block_updated, 'success')
      setEditingBlock(false)
      setSelectedBlock((prev) => prev ? { ...prev, ...updates } : null)
    } catch { showToast(t.plan_block_update_error, 'error') }
    finally { setSavingBlock(false) }
  }, [selectedBlock, editBlockStart, editBlockEnd, editBlockType, editBlockLabel, editRecurrence, editScope,
      updateTimeBlock, removeTimeBlock, updateSeries, addRoutine, userId, refreshAfterRoutineChange, showToast, t])

  /**
   * Blok silme. Rutin örneğinde "sadece bu" sıradan silmedir (sunucu o günü istisna
   * yazar); "bu ve sonrakiler" seriyi bu örnekten önce bitirir, ilk örnekse siler.
   */
  const handleDeleteBlock = useCallback(async () => {
    if (!selectedBlock) return
    const block = selectedBlock
    setSelectedBlock(null)
    try {
      if (block.routine_id && editScope === 'following') {
        const occ = block.occurrence_date ?? block.date
        const routine = routines.find((r) => r.id === block.routine_id)
        const endsOn = shiftIsoDate(occ, -1)
        if (occ <= todayDate() || !routine || endsOn < routine.starts_on) {
          await removeRoutine(supabase, block.routine_id)
        } else {
          await updateSeries(supabase, block.routine_id, { ends_on: endsOn }, occ)
        }
        refreshAfterRoutineChange()
        showToast(t.plan_routine_deleted, 'success')
      } else {
        await removeTimeBlock(supabase, block.id)
      }
    } catch { showToast(t.plan_block_delete_error, 'error') }
  }, [selectedBlock, editScope, routines, removeRoutine, updateSeries, removeTimeBlock, refreshAfterRoutineChange, showToast, t])

  return {
    showAddBlock, setShowAddBlock,
    newBlockTime, setNewBlockTime, newBlockEnd, setNewBlockEnd,
    newBlockLabel, setNewBlockLabel, newBlockType, setNewBlockType,
    recurrence, setRecurrence,
    selectedBlock, setSelectedBlock, editingBlock, setEditingBlock,
    editBlockStart, setEditBlockStart, editBlockEnd, setEditBlockEnd,
    editBlockType, setEditBlockType, editBlockLabel, setEditBlockLabel,
    editRecurrence, setEditRecurrence, editScope, setEditScope,
    savingBlock,
    handleAddBlock, handleToggleBlockDone, handleSlotClick, openAddBlock, openBlockDetail,
    handleSaveBlockEdit, handleDeleteBlock,
  }
}

export type PlanningBlockEditor = ReturnType<typeof usePlanningBlockEditor>
