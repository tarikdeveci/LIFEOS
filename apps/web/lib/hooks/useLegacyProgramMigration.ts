'use client'

import { useEffect, useRef } from 'react'
import type { AiProgramPlan } from '@lifeos/shared'
import {
  legacyProgramsKey, manualProgramToPlan, readLegacyPrograms, type ManualProgram,
} from '@/lib/workoutPrograms'

/**
 * Bu tarayıcıda localStorage'da kalmış eski programları bir kereliğine hesaba
 * taşır. Anahtar yüklemeden ÖNCE silinir: iki sekme aynı anda açılırsa ikincisi
 * boş okur ve programlar iki kez yazılmaz. Yazılamayanlar geri konur, bir
 * sonraki açılışta yeniden denenir.
 */
export function useLegacyProgramMigration(
  userId: string,
  save: (plan: AiProgramPlan) => Promise<unknown>,
  dayName: string,
  onMigrated: (count: number) => void,
): void {
  const running = useRef(false)

  useEffect(() => {
    if (running.current) return
    const key = legacyProgramsKey(userId)
    let programs: ManualProgram[]
    try {
      programs = readLegacyPrograms(window.localStorage.getItem(key))
      window.localStorage.removeItem(key)
    } catch {
      return
    }
    if (programs.length === 0) return

    running.current = true
    void (async () => {
      const failed: ManualProgram[] = []
      for (const program of programs) {
        try {
          await save(manualProgramToPlan(program, dayName))
        } catch {
          failed.push(program)
        }
      }
      if (failed.length > 0) {
        try {
          window.localStorage.setItem(key, JSON.stringify(failed))
        } catch {
          // Depolama kapalıysa yapacak bir şey yok; program zaten buluta yazılamadı.
        }
      }
      const migrated = programs.length - failed.length
      if (migrated > 0) onMigrated(migrated)
      running.current = false
    })()
  }, [userId, save, dayName, onMigrated])
}
