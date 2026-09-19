'use client'

import { useEffect, useState } from 'react'
import type { Task } from '@lifeos/shared'
import { searchTasks } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'

/** Yazmayı bırakınca açık görevlerin başlığında arar; 2 harften kısası aramaz. */
export function useTaskSearch(userId: string, query: string): Task[] {
  const [results, setResults] = useState<Task[]>([])

  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) {
      setResults([])
      return
    }
    let active = true
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const found = await searchTasks(supabase, userId, text)
          if (active) setResults(found)
        } catch {
          if (active) setResults([])
        }
      })()
    }, 200)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [userId, query])

  return results
}
