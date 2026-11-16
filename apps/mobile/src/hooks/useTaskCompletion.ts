import { useCallback } from 'react'
import { Alert } from 'react-native'
import { useTaskStore } from '@lifeos/shared'
import type { Task } from '@lifeos/shared'
import { supabase } from '../lib/supabase'
import { recordValueMoment } from '../lib/review'
import { useLang } from '../contexts/LangContext'

/**
 * Görevi tamamla veya geri al. Bugün, Görevler ve görev ayrıntısı aynı yolu kullanır:
 * store önce ekranı günceller, yazma başarısızsa eski hâline döner ve kullanıcı bunu görür.
 */
export function useTaskCompletion() {
  const setStatus = useTaskStore((s) => s.setStatus)
  const { t } = useLang()
  return useCallback(async (task: Pick<Task, 'id' | 'status'>, done = task.status !== 'done'): Promise<boolean> => {
    try {
      await setStatus(supabase, task.id, done ? 'done' : 'planned')
      if (done) void recordValueMoment()
      return true
    } catch {
      Alert.alert(t.task_save_failed, t.task_status_error)
      return false
    }
  }, [setStatus, t])
}
