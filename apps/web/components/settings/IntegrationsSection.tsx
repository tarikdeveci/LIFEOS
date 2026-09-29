'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Integration, IntegrationProvider } from '@lifeos/shared'
import { deleteIntegration, getIntegrations } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useLang } from '@/lib/contexts/LangContext'

const PROVIDER_LABELS: Record<IntegrationProvider, string> = {
  google_calendar: 'Google Takvim',
  jira: 'Jira',
  slack: 'Slack',
  notion: 'Notion',
  todoist: 'Todoist',
  ticktick: 'TickTick',
  microsoft_todo: 'Microsoft To Do',
}

/** Bağlı hesaplar (durum, son senkron, bağlantıyı kes) ve tek seferlik içe aktarma. */
export function IntegrationsSection() {
  const { t, lang } = useLang()
  const { showToast } = useToast()
  // undefined: yükleniyor
  const [items, setItems] = useState<Integration[] | undefined>(undefined)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setItems(user ? await getIntegrations(supabase, user.id) : [])
    } catch {
      setItems([])
      showToast(t.integ_error, 'error')
    }
  }, [showToast, t.integ_error])

  useEffect(() => { void load() }, [load])

  // Google OAuth dönüşü: /settings?integration=google&status=ok|error|denied
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('integration') !== 'google') return
    const status = params.get('status')
    showToast(status === 'ok' ? t.integ_google_ok : t.integ_google_error, status === 'ok' ? 'success' : 'error')
    window.history.replaceState(null, '', window.location.pathname)
  }, [showToast, t.integ_google_ok, t.integ_google_error])

  const connectGoogle = async () => {
    setBusy('google')
    try {
      const res = await fetch('/api/integrations/google/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: 'web' }),
      })
      if (res.status === 503) { showToast(t.integ_google_unavailable, 'error'); return }
      const body = (await res.json()) as { url?: string }
      if (!res.ok || !body.url) throw new Error(String(res.status))
      window.location.href = body.url
    } catch { showToast(t.integ_google_error, 'error') }
    finally { setBusy(null) }
  }

  const hasGoogle = items?.some((i) => i.provider === 'google_calendar') ?? false

  const disconnect = async (item: Integration) => {
    if (!window.confirm(t.integ_disconnect_confirm)) return
    setBusy(item.id)
    try {
      // Google token'ı sağlayıcıda da iptal edilsin diye sunucudan kesilir.
      if (item.provider === 'google_calendar') {
        const res = await fetch('/api/integrations/google/disconnect', { method: 'POST' })
        if (!res.ok) throw new Error(String(res.status))
      } else {
        await deleteIntegration(supabase, item.id)
      }
      setItems((prev) => prev?.filter((i) => i.id !== item.id))
      showToast(t.integ_disconnected, 'success')
    } catch { showToast(t.integ_import_error, 'error') }
    finally { setBusy(null) }
  }

  const importTodoist = async () => {
    setBusy('todoist')
    try {
      const res = await fetch('/api/import/todoist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      })
      const body = (await res.json()) as { created?: number; updated?: number }
      if (res.status === 401 || res.status === 400) { showToast(t.integ_todoist_bad_token, 'error'); return }
      if (!res.ok) throw new Error(String(res.status))
      setToken('')
      showToast(t.integ_todoist_done.replace('{created}', String(body.created ?? 0)).replace('{updated}', String(body.updated ?? 0)), 'success')
    } catch { showToast(t.integ_import_error, 'error') }
    finally { setBusy(null) }
  }

  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'

  return (
    <div className="glass space-y-5 rounded-2xl p-6">
      <div>
        <h3 className="font-semibold text-primary">{t.integ_title}</h3>
        <p className="text-sm text-muted">{t.integ_subtitle}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-primary">{t.integ_connected}</p>
        {items === undefined ? (
          <div className="h-10 animate-pulse rounded-xl bg-border/40" />
        ) : items.length === 0 ? (
          <p className="text-xs text-muted">{t.integ_none}</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">
                  {PROVIDER_LABELS[item.provider]}{item.account_label ? ` · ${item.account_label}` : ''}
                </p>
                <p className={`text-xs ${item.status === 'active' ? 'text-muted' : 'text-warning'}`}>
                  {item.status !== 'active'
                    ? t.integ_status_error
                    : item.last_synced_at
                      ? t.integ_last_sync.replace('{date}', new Date(item.last_synced_at).toLocaleString(locale))
                      : t.integ_never_synced}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void disconnect(item)} disabled={busy === item.id}>
                {t.integ_disconnect}
              </Button>
            </div>
          ))
        )}
      </div>

      {items !== undefined && !hasGoogle && (
        <div className="space-y-2 rounded-xl bg-background/60 p-3">
          <p className="text-xs font-semibold text-primary">{t.integ_google}</p>
          <p className="text-xs text-muted">{t.integ_google_hint}</p>
          <Button size="sm" onClick={() => void connectGoogle()} disabled={busy === 'google'}>{t.integ_google_connect}</Button>
        </div>
      )}

      <div className="space-y-3 border-t border-border/60 pt-4">
        <p className="text-sm font-medium text-primary">{t.integ_import_title}</p>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-primary">{t.integ_todoist}</p>
          <p className="text-xs text-muted">{t.integ_todoist_hint}</p>
          <div className="flex gap-2">
            <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)}
              placeholder={t.integ_todoist_placeholder}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-primary outline-none focus:border-accent" />
            <Button size="sm" onClick={() => void importTodoist()} disabled={busy === 'todoist' || token.trim().length < 20}>
              {busy === 'todoist' ? '…' : t.integ_todoist_btn}
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-primary">{t.integ_ticktick}</p>
          <p className="text-xs text-muted">{t.integ_ticktick_hint}</p>
        </div>
      </div>
    </div>
  )
}
