'use client'

import { useCallback, useState } from 'react'
import { parseTaskImport, type ImportedTask, type TaskImportResult } from '@lifeos/shared'

const MAX_FILE_BYTES = 1024 * 1024

/**
 * Dosyayı metne çevirir. Türkçe Windows'ta Excel "CSV" kaydını UTF-8 değil
 * Windows-1254 ile yazar; UTF-8 olarak çözülemeyen dosya o kodlamayla okunur,
 * yoksa "ş", "ğ", "ı" bozuk gelir.
 */
export async function readImportFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error('file_too_large')
  const bytes = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1254').decode(bytes)
  }
}

/** Yapıştır, önizle, seç akışının durumu. Kaynakta tamamlanmış görevler seçili gelmez. */
export function useTaskImport() {
  const [text, setText] = useState('')
  const [result, setResult] = useState<TaskImportResult | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const preview = useCallback((source: string) => {
    const parsed = parseTaskImport(source)
    setResult(parsed)
    setSelected(new Set(parsed.tasks.flatMap((task, index) => (task.done ? [] : [index]))))
  }, [])

  const toggle = useCallback((index: number) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelected(new Set(result?.tasks.map((_, index) => index) ?? []))
  }, [result])

  const selectNone = useCallback(() => setSelected(new Set()), [])
  const back = useCallback(() => setResult(null), [])

  const reset = useCallback(() => {
    setText('')
    setResult(null)
    setSelected(new Set())
  }, [])

  const chosen: ImportedTask[] = result?.tasks.filter((_, index) => selected.has(index)) ?? []

  return { text, setText, result, selected, chosen, preview, toggle, selectAll, selectNone, back, reset }
}
