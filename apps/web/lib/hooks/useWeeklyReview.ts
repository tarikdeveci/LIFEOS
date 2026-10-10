'use client'

import { useWeeklyReview as useSharedWeeklyReview } from '@lifeos/shared'
import { supabase } from '@/lib/supabase/client'

/**
 * Seçili hafta ve bir önceki hafta için veriyi tek seferde (14 gün) çeker,
 * iki özeti aynı veriden çıkarır; karşılaştırma okları buradan gelir.
 */
export function useWeeklyReview(userId: string | null, start: string) {
  return useSharedWeeklyReview({ supabase, userId, start })
}
