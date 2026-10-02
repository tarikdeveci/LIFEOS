'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { todayDate, usePlanningStore, describeAiError, type BlockType } from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'
import { useLang } from '@/lib/contexts/LangContext'
import { useCommandParam } from '@/lib/hooks/useCommandParam'
import { useToast } from '@/components/ui/Toast'

const AI_BUFFER_MINUTES = 15

export interface ReplanAction {
  action: 'add' | 'remove' | 'move'
  block_id?: string
  block?: { start_time?: string; end_time?: string; block_type?: BlockType; label?: string; task_id?: string }
}
export interface ChatMessage { role: 'user' | 'assistant'; text: string; actions?: ReplanAction[] }

interface UsePlanningAiChatOptions {
  userId: string
  isPro: boolean
  /** Free kullanıcı ücretsiz AI planlama haklarını bitirdi: gönderim kapalı. */
  freePlansUsedUp: boolean
  refreshFreePlans: () => Promise<void>
  /** Komut paletinden soru geldiğinde çağrılır: sohbet gün görünümünde durur. */
  onAsk: () => void
}

/**
 * Planlama ekranındaki AI sohbetinin durumu: mesajlar, gönderim ve önerilen
 * değişikliklerin uygulanması. Durum PlanningView'da yaşar (hafta/ay görünümüne
 * geçilince sohbet silinmesin), arayüzü PlanningAiChat çizer.
 */
export function usePlanningAiChat({ userId, isPro, freePlansUsedUp, refreshFreePlans, onAsk }: UsePlanningAiChatOptions) {
  const { date, timeBlocks, fetchDayData, addTimeBlock, updateTimeBlock, removeTimeBlock } = usePlanningStore()
  const { showToast } = useToast()
  const { t, lang } = useLang()

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput]       = useState('')
  const chatInputRef = useRef<HTMLInputElement>(null)

  // Komut paletinden "AI'a sor" (?ask=): sohbet gün görünümünde, kutu doldurulur
  // ama gönderilmez; ücretsiz planlardan biri kullanıcı onaylamadan harcanmasın.
  useCommandParam('ask', (text) => {
    onAsk()
    setChatInput(text)
    setTimeout(() => chatInputRef.current?.focus(), 0)
  })
  const [chatLoading, setChatLoading]   = useState(false)
  const [pendingActions, setPendingActions] = useState<ReplanAction[] | null>(null)
  const [applyingActions, setApplyingActions] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  // Öneriler üretildiği günün bloklarına göredir: gün değişince bekleyen değişiklikler
  // düşer, yoksa "Uygula" eklemeleri yeni güne, silmeleri eski günün bloklarına yapardı.
  useEffect(() => {
    setPendingActions(null)
  }, [date])

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || chatLoading || freePlansUsedUp) return
    const userMsg = chatInput.trim()
    // Sohbet gecmisi sunucuya gonderilir: aksi halde her mesaj sifirdan
    // basliyor ve "biraz daha gec yap" gibi bir duzeltme baglamsiz kaliyor.
    const history = chatMessages.slice(-8).map((m) => ({ role: m.role, text: m.text }))
    setChatInput(''); setChatMessages((p) => [...p, { role: 'user', text: userMsg }]); setChatLoading(true)
    try {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) { const { data: r } = await supabase.auth.refreshSession(); session = r.session }
      if (!session) throw new Error('Oturum bulunamadı')
      const { data, error } = await supabase.functions.invoke('ai-suggest', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          type: 'replan', language: lang, date, today: todayDate(), user_message: userMsg, buffer_minutes: AI_BUFFER_MINUTES, history,
          current_time: new Date().toLocaleTimeString(lang === 'tr' ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          existing_blocks: timeBlocks.map((b) => ({ id: b.id, start: b.start_time.slice(0, 5), end: b.end_time.slice(0, 5), label: b.label ?? b.block_type })),
        },
      })
      if (error) throw error
      // Başarılı çağrı bir ücretsiz hak yedi; sayaç sunucuda, yeniden oku
      if (!isPro) void refreshFreePlans()
      const result = data as { message: string; actions?: ReplanAction[] }
      const actions = result.actions?.filter((a) =>
        (a.action === 'add' && a.block?.start_time && a.block?.end_time) ||
        (a.action === 'remove' && a.block_id) ||
        (a.action === 'move' && a.block_id && a.block?.start_time && a.block?.end_time)
      ) ?? []
      setChatMessages((p) => [...p, { role: 'assistant', text: result.message, actions }])
      if (actions.length > 0) setPendingActions(actions)
    } catch (err) {
      const info = await describeAiError(err, lang)
      if (info.detail) console.error('ai-suggest replan:', info.status, info.detail)
      setChatMessages((p) => [...p, { role: 'assistant', text: info.message }])
      // Hak başka bir cihazda bitmiş olabilir: sayacı yenile, Pro çağrısı çıksın
      if (info.kind === 'subscription' && !isPro) void refreshFreePlans()
    } finally { setChatLoading(false) }
  }, [chatInput, chatLoading, chatMessages, date, lang, timeBlocks, freePlansUsedUp, isPro, refreshFreePlans])

  const handleApplyPendingActions = useCallback(async () => {
    if (!pendingActions || applyingActions) return
    setApplyingActions(true)
    let added = 0; let removed = 0; let moved = 0
    const removedIds = new Set<string>()
    try {
      // 1. Önce AI'nın explicit remove/move aksiyonlarını uygula
      for (const a of pendingActions) {
        if (a.action === 'remove' && a.block_id && !removedIds.has(a.block_id)) {
          await removeTimeBlock(supabase, a.block_id)
          removedIds.add(a.block_id)
          removed++
        } else if (a.action === 'move' && a.block_id && a.block?.start_time && a.block?.end_time) {
          await updateTimeBlock(supabase, a.block_id, { start_time: a.block.start_time, end_time: a.block.end_time })
          moved++
        }
      }
      // 2. Add aksiyonları: çakışan blokları zorla sil, sonra ekle
      for (const a of pendingActions) {
        if (a.action === 'add' && a.block?.start_time && a.block?.end_time) {
          const latestBlocks = usePlanningStore.getState().timeBlocks
          const conflicts = latestBlocks.filter(
            (b) => !removedIds.has(b.id) && b.start_time.slice(0, 5) < a.block!.end_time! && b.end_time.slice(0, 5) > a.block!.start_time!,
          )
          for (const c of conflicts) {
            await removeTimeBlock(supabase, c.id)
            removedIds.add(c.id)
            removed++
          }
          await addTimeBlock(supabase, userId, {
            date, start_time: a.block.start_time, end_time: a.block.end_time,
            block_type: a.block.block_type ?? 'task', label: a.block.label,
            ...(a.block.task_id && { task_id: a.block.task_id }),
          })
          added++
        }
      }
      const parts = [
        added > 0 && t.plan_applied_added.replace('{n}', String(added)),
        removed > 0 && t.plan_applied_replaced.replace('{n}', String(removed)),
        moved > 0 && t.plan_applied_moved.replace('{n}', String(moved)),
      ].filter(Boolean)
      showToast(parts.join(', '), 'success')
      setPendingActions(null)
      void fetchDayData(supabase, userId, date)
    } catch {
      showToast(t.plan_apply_error, 'error')
      // Partial failures: always refetch to show consistent state
      void fetchDayData(supabase, userId, date)
    } finally { setApplyingActions(false) }
  }, [pendingActions, applyingActions, userId, date, addTimeBlock, removeTimeBlock, updateTimeBlock, fetchDayData, showToast, t])

  return {
    chatMessages, chatInput, setChatInput, chatInputRef, chatLoading, chatEndRef,
    pendingActions, setPendingActions, applyingActions,
    handleSendChat, handleApplyPendingActions,
  }
}

export type PlanningAiChatState = ReturnType<typeof usePlanningAiChat>
