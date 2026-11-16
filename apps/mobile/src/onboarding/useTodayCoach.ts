import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'
import { useLang } from '@/src/contexts/LangContext'
import { hasSeenCoach, markCoachSeen } from '@/src/onboarding/storage'
import { startCoach } from '@/src/onboarding/coach'

/**
 * Bugün ekranı ilk kez odaklandığında gerçek öğeler üstünde kısa bir ipucu turu
 * açar (hesap başına bir kez). Tanıtım sonrası açılan deneme teklifi kapanıp
 * ekran yeniden odaklanınca başlar; ikisi üst üste binmez.
 */
export function useTodayCoach(userId: string | null): void {
  const { t } = useLang()
  const started = useRef(false)

  useFocusEffect(useCallback(() => {
    if (!userId || started.current) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    void (async () => {
      if (await hasSeenCoach(userId)) { started.current = true; return }
      // Kartlar veriyle dolup yerine otursun diye kısa bir bekleme; ölçüm ondan sonra.
      timer = setTimeout(() => {
        if (cancelled) return
        started.current = true
        startCoach([
          { target: 'today_tasks', title: t.ux_coach_tasks_title, body: t.ux_coach_tasks_body },
          { target: 'today_calendar', title: t.ux_coach_calendar_title, body: t.ux_coach_calendar_body },
          { target: 'tab_bar', title: t.ux_coach_tabs_title, body: t.ux_coach_tabs_body },
          { target: 'today_settings', title: t.ux_coach_settings_title, body: t.ux_coach_settings_body },
        ], () => void markCoachSeen(userId))
      }, 900)
    })()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [userId, t]))
}
