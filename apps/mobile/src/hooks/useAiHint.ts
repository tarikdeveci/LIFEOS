import { useCallback, useEffect, useState } from 'react'
import { loadHintState, saveHintState, shouldShowHint, updateHintState, type AiHintId } from '@/src/ai/hints'
import { useAuth } from '@/src/contexts/AuthContext'

/**
 * Tek satır AI ipucunun sıklığı: günde en çok bir kez görünür; kapatılınca ya da
 * kullanılınca 30 gün susar. `active` false iken (koşul yokken) hiç görünmez.
 */
export function useAiHint(id: AiHintId, active: boolean) {
  const { userId } = useAuth()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!userId) {
      setAllowed(false)
      return
    }
    void loadHintState(userId).then((state) => {
      if (!cancelled) setAllowed(shouldShowHint(state[id], Date.now()))
    })
    return () => { cancelled = true }
  }, [id, userId])

  const visible = allowed && active

  // Görünür olduğu gün işaretlenir; ekran tekrar açıldığında aynı gün yeniden çıkmaz.
  useEffect(() => {
    if (!visible || !userId) return
    void loadHintState(userId).then((state) =>
      saveHintState(userId, updateHintState(state, id, 'show', new Date().toISOString())))
  }, [visible, id, userId])

  const record = useCallback(async (action: 'close' | 'use') => {
    setAllowed(false)
    if (!userId) return
    const state = await loadHintState(userId)
    await saveHintState(userId, updateHintState(state, id, action, new Date().toISOString()))
  }, [id, userId])

  const close = useCallback(() => { void record('close') }, [record])
  const use = useCallback(() => { void record('use') }, [record])

  return { visible, close, use }
}
