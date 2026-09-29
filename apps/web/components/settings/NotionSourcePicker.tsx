'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useLang } from '@/lib/contexts/LangContext'

interface Props {
  integrationId: string
  /** Kayıtlı seçim varken seçici kapalı başlar ("Veritabanını değiştir" ile açılır). */
  hasSelection: boolean
  onSaved: () => void
}

interface Source { id: string; name: string }

/** Notion bağlantısı için senkronlanacak veri kaynağını seçtirir. */
export function NotionSourcePicker({ integrationId, hasSelection, onSaved }: Props) {
  const { t } = useLang()
  const { showToast } = useToast()
  const [open, setOpen] = useState(!hasSelection)
  const [sources, setSources] = useState<Source[] | null>(null)
  const [choice, setChoice] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || sources !== null) return
    void (async () => {
      try {
        const res = await fetch(`/api/integrations/notion/sources?integration=${encodeURIComponent(integrationId)}`)
        const body = (await res.json()) as { sources?: Source[]; selected?: string | null }
        if (!res.ok) throw new Error(String(res.status))
        setSources(body.sources ?? [])
        setChoice(body.selected ?? body.sources?.[0]?.id ?? '')
      } catch {
        setSources([])
        showToast(t.integ_error, 'error')
      }
    })()
  }, [open, sources, integrationId, showToast, t.integ_error])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/integrations/notion/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration: integrationId, data_source_id: choice }),
      })
      if (!res.ok) throw new Error(String(res.status))
      showToast(t.integ_notion_saved, 'success')
      setOpen(false)
      onSaved()
    } catch { showToast(t.integ_import_error, 'error') }
    finally { setSaving(false) }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-accent hover:underline">
        {t.integ_notion_change}
      </button>
    )
  }

  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs text-muted">{t.integ_notion_pick}</p>
      {sources === null ? (
        <div className="h-9 animate-pulse rounded-xl bg-border/40" />
      ) : sources.length === 0 ? (
        <p className="text-xs text-warning">{t.integ_notion_none}</p>
      ) : (
        <div className="flex gap-2">
          <select value={choice} onChange={(e) => setChoice(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-primary outline-none focus:border-accent">
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button size="sm" onClick={() => void save()} disabled={saving || !choice}>{saving ? '…' : t.integ_connect}</Button>
        </div>
      )}
    </div>
  )
}
