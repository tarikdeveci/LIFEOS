// brain_dump değerlendirmesi: dağınık metinden görev listesi.
// İstek ve ayrıştırma üretimdeki fonksiyonlarla aynı (ai-suggest/tasks.ts).

import { brainDumpRequest, parseBrainDump } from '../../../supabase/functions/ai-suggest/tasks.ts'
import type { RouteEval } from '../run.ts'

export interface BrainDumpFixture {
  text: string
  /** Metinden beklenen görev sayısı; ±1 kabul. */
  expect_count: number
  /** Göreli tarihlerin çözüleceği gün (YYYY-MM-DD). */
  today?: string
}

/** Vakalar sabit bir güne göre yazıldı: ölçüm takvimden bağımsız kalsın. */
const DEFAULT_TODAY = '2026-11-02'
/** ai-suggest/index.ts içindeki Türkçe dil talimatı. */
const LANG_INSTR = 'Türkçe yanıt ver.'
const COUNT_TOLERANCE = 1

export const brainDumpEval: RouteEval<BrainDumpFixture> = {
  route: 'brain_dump',
  fixture(raw) {
    if (typeof raw !== 'object' || raw === null) throw new Error('brain_dump vakası nesne olmalı')
    const { text, expect_count, today } = raw as Record<string, unknown>
    if (typeof text !== 'string' || !Number.isInteger(expect_count)) {
      throw new Error('brain_dump vakası text ve tam sayı expect_count içermeli')
    }
    return { text, expect_count: expect_count as number, ...(typeof today === 'string' ? { today } : {}) }
  },
  // Üretim işleyicisi gibi: kırpılmış, en fazla 4000 karakter.
  build: (f) => brainDumpRequest(f.text.trim().slice(0, 4000), f.today ?? DEFAULT_TODAY, LANG_INSTR),
  check(result, f) {
    const tasks = parseBrainDump(result.text)
    const parsed = tasks !== null
    return {
      parsed,
      checks: { count: parsed && Math.abs(tasks.length - f.expect_count) <= COUNT_TOLERANCE },
    }
  },
}
