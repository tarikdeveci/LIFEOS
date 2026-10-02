'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Integration, IntegrationProvider } from '@lifeos/shared'
import { deleteIntegration, getIntegrations } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useLang } from '@/lib/contexts/LangContext'
import { NotionSourcePicker } from './NotionSourcePicker'

/** Marka adları; Google Takvim dile göre değiştiği için `providerLabel` içinde sözlükten gelir. */
const PROVIDER_LABELS: Record<Exclude<IntegrationProvider, 'google_calendar'>, string> = {
  jira: 'Jira',
  slack: 'Slack',
  notion: 'Notion',
  todoist: 'Todoist',
  ticktick: 'TickTick',
  microsoft_todo: 'Microsoft To Do',
}

/** OAuth ile bağlanan görev kaynakları: rota slug'ı ve tablodaki sağlayıcı adı. */
const SOURCES = [
  { slug: 'jira', provider: 'jira', hint: 'integ_jira_hint' },
  { slug: 'notion', provider: 'notion', hint: 'integ_notion_hint' },
  { slug: 'microsoft', provider: 'microsoft_todo', hint: 'integ_microsoft_hint' },
  { slug: 'slack', provider: 'slack', hint: 'integ_slack_hint' },
] as const satisfies readonly { slug: string; provider: IntegrationProvider; hint: string }[]

const SLUG_PROVIDER: Record<string, IntegrationProvider> = {
  google: 'google_calendar', ...Object.fromEntries(SOURCES.map((s) => [s.slug, s.provider])),
}

/** Bağlı hesaplar (durum, son senkron, bağlantıyı kes) ve tek seferlik içe aktarma. */
export function IntegrationsSection() {
  const { t, lang } = useLang()
  const { showToast } = useToast()
  // undefined: yükleniyor
  const [items, setItems] = useState<Integration[] | undefined>(undefined)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const providerLabel = useCallback(
    (provider: IntegrationProvider) => (provider === 'google_calendar' ? t.integ_google : PROVIDER_LABELS[provider]),
    [t.integ_google],
  )

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

  // OAuth dönüşü: /settings?integration=<slug>&status=ok|error|denied
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const provider = SLUG_PROVIDER[params.get('integration') ?? '']
    if (!provider) return
    const name = providerLabel(provider)
    const ok = params.get('status') === 'ok'
    showToast((ok ? t.integ_connect_ok : t.integ_connect_error).replace('{name}', name), ok ? 'success' : 'error')
    window.history.replaceState(null, '', window.location.pathname)
  }, [showToast, providerLabel, t.integ_connect_ok, t.integ_connect_error])

  const connect = async (slug: string) => {
    setBusy(slug)
    const name = providerLabel(SLUG_PROVIDER[slug]!)
    try {
      const res = await fetch(`/api/integrations/${slug}/start`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform: 'web' }),
      })
      if (res.status === 503) { showToast(t.integ_unavailable.replace('{name}', name), 'error'); return }
      const body = (await res.json()) as { url?: string }
      if (!res.ok || !body.url) throw new Error(String(res.status))
      window.location.href = body.url
    } catch { showToast(t.integ_connect_error.replace('{name}', name), 'error') }
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
    } catch { showToast(t.integ_disconnect_error, 'error') }
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
            <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-primary">
                  {providerLabel(item.provider)}{item.account_label ? ` · ${item.account_label}` : ''}
                </p>
                <p className={`text-xs ${item.status === 'active' && !item.last_error ? 'text-muted' : 'text-warning'}`}>
                  {item.status !== 'active'
                    ? t.integ_status_error
                    : item.last_error
                      ? t.integ_sync_failing
                    : item.last_synced_at
                      ? t.integ_last_sync.replace('{date}', new Date(item.last_synced_at).toLocaleString(locale))
                      : t.integ_never_synced}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void disconnect(item)} disabled={busy === item.id}>
                {t.integ_disconnect}
              </Button>
              {item.provider === 'notion' && (
                <div className="basis-full">
                  <NotionSourcePicker integrationId={item.id} hasSelection={typeof item.settings['data_source_id'] === 'string'}
                    onSaved={() => void load()} />
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {items !== undefined && !hasGoogle && (
        <div className="space-y-2 rounded-xl bg-background/60 p-3">
          <p className="text-xs font-semibold text-primary">{t.integ_google}</p>
          <p className="text-xs text-muted">{t.integ_google_hint}</p>
          <Button size="sm" onClick={() => void connect('google')} disabled={busy === 'google'}>{t.integ_google_connect}</Button>
        </div>
      )}

      {items !== undefined && (
        <div className="space-y-2 border-t border-border/60 pt-4">
          <p className="text-sm font-medium text-primary">{t.integ_sources}</p>
          <p className="text-xs text-muted">{t.integ_sources_hint}</p>
          {SOURCES.filter((src) => !items.some((i) => i.provider === src.provider)).map((src) => (
            <div key={src.slug} className="flex items-center gap-3 rounded-xl bg-background/60 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-primary">{providerLabel(src.provider)}</p>
                <p className="text-xs text-muted">{t[src.hint]}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => void connect(src.slug)} disabled={busy === src.slug}>
                {t.integ_connect}
              </Button>
            </div>
          ))}
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
