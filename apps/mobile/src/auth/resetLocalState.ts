import { emptyWidgetSnapshot, useFocusStore, useGoalStore } from '@lifeos/shared'
import { useHealthStore } from '@/src/stores/healthStore'
import { cancelFocusNotifications } from '@/src/notifications/focus'
import { persistWidgetSnapshot } from '@/src/widgets/storage'

/**
 * Cihazdaki kullanıcıya özel durumu temizler. Çıkışta ve kullanıcı kimliği değiştiğinde
 * (misafirden başka hesaba giriş) çağrılır: bir hesabın sağlık verisi, odak ve widget'ı
 * ötekine görünmesin.
 */
export function resetLocalUserState(): void {
  useHealthStore.getState().reset()
  useGoalStore.getState().reset()
  useFocusStore.getState().reset()
  void cancelFocusNotifications()
  void persistWidgetSnapshot(emptyWidgetSnapshot())
}
