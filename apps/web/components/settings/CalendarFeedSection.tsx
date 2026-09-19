'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useLang } from '@/lib/contexts/LangContext'

interface CalendarFeed {
  created_at: string
  last_fetched_at: string | null
}

type Busy = 'create' | 'delete' | null

function isFeed(value: unknown): value is CalendarFeed {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>)['created_at'] === 'string'
}

/** Takvim uygulamalarının "URL'den ekle" sayfaları; link webcal:// ile de açılabilir. */
function subscribeLinks(url: string) {
  const webcal = url.replace(/^https?:\/\//, 'webcal://')
  return {
    google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
    apple: webcal,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=LifeOS`,
  }
}

/**
 * Zaman bloklarını Google Takvim, Outlook ve Apple Takvim'e abonelik linkiyle
 * taşır. Link yalnızca oluşturulduğu an gösterilir (sunucuda hash'i tutulur);
 * kaybolursa yenisi üretilir ve eskisi çalışmaz.
 */
export function CalendarFeedSection() {
  const { t, lang } = useLang()
  const { showToast } = useToast()
  // undefined: yükleniyor, null: link yok
  const [feed, setFeed] = useState<CalendarFeed | null | undefined>(undefined)
  const [newUrl, setNewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const res = await fetch('/api/calendar')
        if (!res.ok) throw new Error(String(res.status))
        const body: unknown = await res.json()
        const value = (body as Record<string, unknown>)['feed']
        if (active) setFeed(isFeed(value) ? value : null)
      } catch {
        if (active) {
          setFeed(null)
          showToast(t.cal_error, 'error')
        }
      }
    })()
    return () => { active = false }
  }, [showToast, t.cal_error])

  const create = useCallback(async () => {
    if (feed && !window.confirm(t.cal_rotate_confirm)) return
    setBusy('create')
    try {
      const res = await fetch('/api/calendar', { method: 'POST' })
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as Record<string, unknown>
      const value = body['feed']
      const url = body['url']
      if (!isFeed(value) || typeof url !== 'string') throw new Error('unexpected body')
      setFeed(value)
      setNewUrl(url)
    } catch {
      showToast(t.cal_error, 'error')
    } finally {
      setBusy(null)
    }
  }, [feed, showToast, t.cal_error, t.cal_rotate_confirm])

  const disable = useCallback(async () => {
    if (!window.confirm(t.cal_disable_confirm)) return
    setBusy('delete')
    try {
      const res = await fetch('/api/calendar', { method: 'DELETE' })
      if (!res.ok) throw new Error(String(res.status))
      setFeed(null)
      setNewUrl(null)
    } catch {
      showToast(t.cal_error, 'error')
    } finally {
      setBusy(null)
    }
  }, [showToast, t.cal_error, t.cal_disable_confirm])

  const copy = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      showToast(t.cal_copied, 'success')
    } catch {
      showToast(t.cal_error, 'error')
    }
  }, [showToast, t.cal_copied, t.cal_error])

  const fmt = (iso: string) => new Date(iso).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const links = newUrl ? subscribeLinks(newUrl) : null

  return (
    <div className="glass space-y-4 rounded-2xl p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-primary">{t.cal_title}</h2>
        <p className="text-sm text-muted">{t.cal_desc}</p>
      </div>

      {feed === undefined ? (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      ) : (
        <>
          {newUrl && links && (
            <div className="space-y-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
              <p className="text-xs font-semibold text-warning">{t.cal_copy_now}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-background px-3 py-2 font-mono text-xs text-primary">{newUrl}</code>
                <Button size="sm" variant="outline" onClick={() => void copy(newUrl)}>{t.cal_copy}</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <a href={links.google} target="_blank" rel="noopener noreferrer"
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-border/30">{t.cal_open_google}</a>
                <a href={links.apple}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-border/30">{t.cal_open_apple}</a>
                <a href={links.outlook} target="_blank" rel="noopener noreferrer"
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-border/30">{t.cal_open_outlook}</a>
              </div>
            </div>
          )}

          {feed && (
            <div className="rounded-xl border border-border/60 px-4 py-3 text-sm">
              <p className="font-medium text-primary">{t.cal_active}</p>
              <p className="text-xs text-muted">
                {t.cal_created}: {fmt(feed.created_at)} · {t.cal_last_sync}:{' '}
                {feed.last_fetched_at ? fmt(feed.last_fetched_at) : t.cal_never_synced}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void create()} loading={busy === 'create'} disabled={busy !== null}>
              {feed ? t.cal_rotate : t.cal_create}
            </Button>
            {feed && (
              <Button variant="ghost" onClick={() => void disable()} loading={busy === 'delete'} disabled={busy !== null}>
                {t.cal_disable}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">{t.cal_private_note}</p>
        </>
      )}
    </div>
  )
}
