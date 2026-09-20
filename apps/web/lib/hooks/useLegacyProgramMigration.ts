'use client'

import { useEffect, useRef } from 'react'
import type { AiProgramPlan } from '@lifeos/shared'
import {
  legacyProgramsKey, manualProgramToPlan, readLegacyPrograms, type ManualProgram,
} from '@/lib/workoutPrograms'

/** Sahibi bu süre boyunca kuyruğa dokunmadıysa koşu bırakılmış sayılır. */
const CLAIM_TIMEOUT_MS = 60_000

interface PendingRun {
  /** Kuyruğu en son güncelleyen sekmenin zamanı; 0 = sahipsiz, hemen devralınabilir. */
  claimedAt: number
  programs: ManualProgram[]
}

function readPending(raw: string | null): PendingRun | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const { claimedAt, programs } = parsed as Record<string, unknown>
    const list = readLegacyPrograms(JSON.stringify(programs ?? null))
    if (list.length === 0) return null
    return { claimedAt: typeof claimedAt === 'number' ? claimedAt : 0, programs: list }
  } catch {
    return null
  }
}

/**
 * Taşımayı sekmeler arasında teke indirir. Web Locks tüm sayfa bağlamlarında
 * aynı kilidi görür; `ifAvailable` ile ikinci sekme beklemeden çekilir ve
 * sahiplik yarışı (iki sekme aynı kuyruğu okuyup ikisi de devralması) oluşmaz.
 * Kilit sekme kapanınca kendiliğinden bırakılır, kuyruk da zaten diskte durur.
 *
 * Web Locks yoksa (eski tarayıcı) iş kilitsiz yürür: kuyruk sahipliği ve
 * CLAIM_TIMEOUT_MS bugünkü davranışı korur.
 */
async function withMigrationLock(name: string, job: () => Promise<void>): Promise<void> {
  const locks: LockManager | undefined = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks) {
    await job()
    return
  }
  await locks.request(name, { ifAvailable: true }, async (lock) => {
    // null: kilit başka sekmede, taşımayı o yürütüyor.
    if (lock !== null) await job()
  })
}

/**
 * Bu tarayıcıda localStorage'da kalmış eski programları bir kereliğine hesaba
 * taşır.
 *
 * Kaynak anahtar silinmeden ÖNCE programlar bir kuyruk anahtarına geçirilir ve
 * kuyruk her başarılı yazımdan sonra güncellenir: sekme taşımanın ortasında
 * kapanırsa yalnızca buluta yazılmış olanlar düşer, kalanlar bir sonraki
 * açılışta kaldığı yerden denenir. Eskiden anahtar en başta siliniyordu ve
 * yarıda kesilen taşıma programları kalıcı olarak yok ediyordu.
 *
 * Aynı anda tek koşu olması kilitle sağlanır (withMigrationLock). Kuyruktaki
 * `claimedAt` ise kilidin ulaşamadığı durum için: sekme taşımanın ortasında
 * kapanırsa kilit düşer ve sonraki açılış CLAIM_TIMEOUT_MS sonra devralır.
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
    const pendingKey = `${key}.pending`

    /** Kuyruğu yazar; boş listede kuyruğu siler. Depolama kapalıysa false. */
    const writePending = (programs: ManualProgram[], claimedAt: number): boolean => {
      try {
        if (programs.length === 0) window.localStorage.removeItem(pendingKey)
        else window.localStorage.setItem(pendingKey, JSON.stringify({ claimedAt, programs }))
        return true
      } catch {
        return false
      }
    }

    /** Kuyruğu devralır; devralınacak bir şey yoksa null. Kilit altında çağrılır. */
    const claim = (): ManualProgram[] | null => {
      try {
        const fresh = readLegacyPrograms(window.localStorage.getItem(key))
        if (fresh.length > 0) {
          // Kuyruğa yazılamıyorsa kaynağa dokunma: taşıma bir sonraki açılışa kalsın.
          if (!writePending(fresh, Date.now())) return null
          window.localStorage.removeItem(key)
          return fresh
        }
        const pending = readPending(window.localStorage.getItem(pendingKey))
        if (!pending || Date.now() - pending.claimedAt < CLAIM_TIMEOUT_MS) return null
        if (!writePending(pending.programs, Date.now())) return null
        return pending.programs
      } catch {
        return null
      }
    }

    running.current = true
    void withMigrationLock(`lifeos-legacy-programs:${userId}`, async () => {
      const programs = claim()
      if (programs === null) return

      const remaining = [...programs]
      let migrated = 0
      for (const program of programs) {
        try {
          await save(manualProgramToPlan(program, dayName))
          remaining.splice(remaining.indexOf(program), 1)
          migrated += 1
        } catch {
          // Yazılamayan program kuyrukta kalır, sıradakine geçilir.
        }
        writePending(remaining, Date.now())
      }
      // Kalan varsa sahipliği bırak: sonraki açılış beklemeden devralsın.
      if (remaining.length > 0) writePending(remaining, 0)
      if (migrated > 0) onMigrated(migrated)
    }).finally(() => { running.current = false })
  }, [userId, save, dayName, onMigrated])
}
