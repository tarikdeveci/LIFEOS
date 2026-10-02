'use client'

import Link from 'next/link'
import { useLang } from '@/lib/contexts/LangContext'
import type { PlanningAiChatState } from '@/lib/hooks/usePlanningAiChat'

interface PlanningAiChatProps {
  /** usePlanningAiChat'in döndürdüğü durum; PlanningView'da tutulur. */
  chat: PlanningAiChatState
  isPro: boolean
  /** null: sayaç okunamadı, kalan hak rozeti gösterilmez. */
  freePlansLeft: number | null
  freePlansUsedUp: boolean
}

/** Gün görünümünün sağ panelindeki AI planlama sohbeti. */
export function PlanningAiChat({ chat, isPro, freePlansLeft, freePlansUsedUp }: PlanningAiChatProps) {
  const { t } = useLang()
  const {
    chatMessages, chatInput, setChatInput, chatInputRef, chatLoading, chatEndRef,
    pendingActions, setPendingActions, applyingActions,
    handleSendChat, handleApplyPendingActions,
  } = chat

  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-lg shadow-indigo-900/10">
      {/* Header */}
      <div className="flex items-center gap-3 bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg backdrop-blur-sm">
          📅
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{t.plan_ai_assistant}</p>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-300 shadow-[0_0_4px_rgba(165,180,252,0.8)]" />
            <span className="text-[10px] text-white/80">{t.plan_ai_online}</span>
          </div>
        </div>
        {!isPro && freePlansLeft !== null && freePlansLeft > 0 && (
          <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-semibold text-white">
            {t.plan_ai_free_left.replace('{n}', String(freePlansLeft))}
          </span>
        )}
      </div>

      {/* Mesaj alanı */}
      <div className="flex max-h-64 flex-col gap-3 overflow-y-auto bg-gray-50/50 p-4">
        {/* Karşılama balonu: her zaman görünür */}
        <div className="flex items-end gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm">
            📅
          </div>
          <div className="max-w-[90%] space-y-2">
            <div className="rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 text-xs leading-relaxed text-gray-800 shadow-sm ring-1 ring-black/5">
              {t.plan_ai_welcome}
            </div>
            {chatMessages.length === 0 && !freePlansUsedUp && (
              <div className="flex flex-wrap gap-1.5">
                {[t.plan_ai_chip_replan, t.plan_ai_chip_focus, t.plan_ai_chip_break].map((q) => (
                  <button key={q}
                    onClick={() => { setChatInput(q); chatInputRef.current?.focus() }}
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-700 transition hover:bg-indigo-100">
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Konuşma balonları */}
        {chatMessages.map((msg, i) => (
          <div key={i} className={`flex items-end gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {msg.role === 'assistant' && (
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm">
                📅
              </div>
            )}
            <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'rounded-br-sm bg-accent text-white'
                : 'rounded-bl-sm bg-white text-gray-800 shadow-sm ring-1 ring-black/5'
            }`}>
              <p>{msg.text}</p>
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 space-y-0.5 border-t border-white/20 pt-1.5">
                  {msg.actions.map((a, ai) => (
                    <p key={ai} className="text-[10px] opacity-80">
                      {a.action === 'remove' ? '🗑 ' : a.action === 'move' ? '↕ ' : '+ '}
                      {a.block?.start_time && a.block?.end_time ? `${a.block.start_time}-${a.block.end_time} ` : ''}
                      {a.block?.label ?? a.block?.block_type ?? ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Yazıyor animasyonu */}
        {chatLoading && (
          <div className="flex items-end gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm">
              📅
            </div>
            <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
              <div className="flex items-center gap-1">
                {[0, 150, 300].map((delay) => (
                  <span key={delay} className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Pending actions karar kartı */}
      {pendingActions && pendingActions.length > 0 && (
        <div className="mx-3 mb-3 overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50">
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-indigo-800">
              🤖 {t.plan_ai_changes.replace('{n}', String(pendingActions.length))}
            </p>
            <div className="mt-1.5 space-y-0.5">
              {pendingActions.slice(0, 3).map((a, i) => (
                <p key={i} className="text-[11px] text-indigo-600">
                  {a.action === 'remove' ? '🗑' : a.action === 'move' ? '↕' : '+'}{' '}
                  {a.block?.start_time && a.block?.end_time ? `${a.block.start_time}-${a.block.end_time}` : ''}{' '}
                  {a.block?.label ?? a.block?.block_type ?? ''}
                </p>
              ))}
              {pendingActions.length > 3 && (
                <p className="text-[11px] text-indigo-400">{t.plan_ai_more.replace('{n}', String(pendingActions.length - 3))}</p>
              )}
            </div>
          </div>
          <div className="flex border-t border-indigo-200">
            <button onClick={() => void handleApplyPendingActions()} disabled={applyingActions}
              className="flex-1 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40">
              ✓ {t.plan_apply_yes}
            </button>
            <div className="w-px bg-indigo-200" />
            <button onClick={() => setPendingActions(null)}
              className="flex-1 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-50">
              {t.plan_cancel}
            </button>
          </div>
        </div>
      )}

      {/* Input: ücretsiz haklar bittiyse yerine Pro çağrısı */}
      {freePlansUsedUp ? (
        <div className="border-t border-gray-100 p-3">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5">
            <p className="text-xs font-semibold text-indigo-800">{t.plan_ai_free_used_title}</p>
            <p className="mt-0.5 text-[11px] text-indigo-600">{t.plan_ai_free_used_body}</p>
            <Link href="/billing?source=free_limit"
              className="mt-2 inline-block rounded-lg bg-indigo-500 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-indigo-600">
              {t.plan_ai_go_pro}
            </Link>
          </div>
        </div>
      ) : (
      <div className="border-t border-gray-100 p-3">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-indigo-400 focus-within:bg-white transition-colors">
          <input ref={chatInputRef} value={chatInput} onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendChat() } }}
            placeholder={t.plan_replan_placeholder}
            className="flex-1 bg-transparent text-xs text-gray-800 outline-none placeholder:text-gray-400"
            disabled={chatLoading} />
          <button onClick={() => void handleSendChat()}
            disabled={chatLoading || !chatInput.trim()}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white transition hover:bg-indigo-600 disabled:opacity-40">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-gray-400">{t.plan_replan_hint}</p>
      </div>
      )}
    </div>
  )
}
