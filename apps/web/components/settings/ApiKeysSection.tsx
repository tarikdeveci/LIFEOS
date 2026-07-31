'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useLang } from '@/lib/contexts/LangContext'

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  last_used_at: string | null
  created_at: string
}

export default function ApiKeysSection() {
  const { lang } = useLang()
  const { showToast } = useToast()
  const tr = lang === 'tr'

  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [endpoint, setEndpoint] = useState('')

  useEffect(() => {
    setEndpoint(`${window.location.origin}/api/inbox`)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/api-keys')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setKeys(data.keys ?? [])
    } catch {
      showToast(tr ? 'Anahtarlar yüklenemedi' : 'Failed to load keys', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, tr])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = useCallback(async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || (tr ? 'API Anahtarı' : 'API Key') }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setNewKey(data.key)
      setName('')
      await load()
    } catch {
      showToast(tr ? 'Anahtar oluşturulamadı' : 'Failed to create key', 'error')
    } finally {
      setCreating(false)
    }
  }, [name, tr, showToast, load])

  const handleRevoke = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/api-keys?id=${id}`, { method: 'DELETE' })
        if (!res.ok) throw new Error()
        setKeys((prev) => prev.filter((k) => k.id !== id))
        showToast(tr ? 'Anahtar iptal edildi' : 'Key revoked', 'success')
      } catch {
        showToast(tr ? 'İşlem başarısız' : 'Operation failed', 'error')
      }
    },
    [tr, showToast],
  )

  const copy = useCallback(
    (text: string, msg: string) => {
      void navigator.clipboard.writeText(text)
      showToast(msg, 'success')
    },
    [showToast],
  )

  const curlExample =
    `curl -X POST ${endpoint || 'https://<uygulama-adresin>/api/inbox'} \\\n` +
    `  -H "Authorization: Bearer ${tr ? 'BURAYA_ANAHTARINI_YAZ' : 'YOUR_API_KEY'}" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '{"tasks":[{"title":"${tr ? 'Faturayı öde' : 'Pay the invoice'}","due_date":"2026-08-05"}]}'`

  const fmtDate = (s: string) => new Date(s).toLocaleDateString(tr ? 'tr-TR' : 'en-US')

  return (
    <div className="space-y-4">
      {/* Açıklama */}
      <div className="glass rounded-2xl p-6 space-y-2">
        <h2 className="text-lg font-semibold text-primary">{tr ? 'API Anahtarları' : 'API Keys'}</h2>
        <p className="text-sm text-muted">
          {tr
            ? 'Dış otomasyonların (mail tarama, Zapier, n8n, Make…) LifeOS’a görev göndermesi için anahtar oluştur. Gönderilen işler backlog’una “inbox” etiketiyle düşer; oradan yapay zeka ile planlayabilirsin.'
            : 'Create a key so external automations (email scanners, Zapier, n8n, Make…) can push tasks into LifeOS. Incoming items land in your backlog tagged “inbox”, ready to plan with AI.'}
        </p>
      </div>

      {/* Yeni anahtar oluştur */}
      <div className="glass rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-primary">{tr ? 'Yeni Anahtar' : 'New Key'}</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              label={tr ? 'Anahtar adı' : 'Key name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr ? 'ör: Gmail otomasyonu' : 'e.g. Gmail automation'}
            />
          </div>
          <Button onClick={() => void handleCreate()} loading={creating}>
            {tr ? 'Oluştur' : 'Create'}
          </Button>
        </div>

        {/* Tam anahtar — yalnızca bir kez gösterilir */}
        {newKey && (
          <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 space-y-2">
            <p className="text-xs font-semibold text-warning">
              ⚠️ {tr ? 'Bu anahtarı şimdi kopyala — bir daha gösterilmeyecek.' : 'Copy this key now — it won’t be shown again.'}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-lg bg-background px-3 py-2 font-mono text-xs text-primary">
                {newKey}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(newKey, tr ? 'Anahtar kopyalandı' : 'Key copied')}
              >
                {tr ? 'Kopyala' : 'Copy'}
              </Button>
            </div>
            <button
              onClick={() => setNewKey(null)}
              className="text-xs text-muted underline-offset-2 hover:text-primary hover:underline"
            >
              {tr ? 'Kapat' : 'Dismiss'}
            </button>
          </div>
        )}
      </div>

      {/* Mevcut anahtarlar */}
      <div className="glass rounded-2xl p-6 space-y-3">
        <h3 className="text-sm font-semibold text-primary">{tr ? 'Anahtarların' : 'Your Keys'}</h3>
        {loading ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted">{tr ? 'Henüz anahtar yok.' : 'No keys yet.'}</p>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-primary">{k.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted">{k.key_prefix}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {tr ? 'Oluşturuldu' : 'Created'} {fmtDate(k.created_at)}
                    {' · '}
                    {k.last_used_at
                      ? `${tr ? 'son kullanım' : 'last used'} ${fmtDate(k.last_used_at)}`
                      : tr
                        ? 'hiç kullanılmadı'
                        : 'never used'}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => void handleRevoke(k.id)}>
                  {tr ? 'İptal Et' : 'Revoke'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Kullanım */}
      <div className="glass rounded-2xl p-6 space-y-3">
        <h3 className="text-sm font-semibold text-primary">{tr ? 'Nasıl Kullanılır' : 'How to Use'}</h3>
        <div>
          <p className="mb-1 text-xs font-medium text-muted">{tr ? 'Endpoint (POST)' : 'Endpoint (POST)'}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-background px-3 py-2 font-mono text-xs text-primary">
              {endpoint || '…'}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(endpoint, tr ? 'Adres kopyalandı' : 'URL copied')}
            >
              {tr ? 'Kopyala' : 'Copy'}
            </Button>
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted">{tr ? 'Örnek istek' : 'Example request'}</p>
          <pre className="overflow-x-auto rounded-lg bg-background px-3 py-3 font-mono text-[11px] leading-relaxed text-primary">
            {curlExample}
          </pre>
          <button
            onClick={() => copy(curlExample, tr ? 'Örnek kopyalandı' : 'Example copied')}
            className="mt-2 text-xs text-accent underline-offset-2 hover:underline"
          >
            {tr ? 'Örneği kopyala' : 'Copy example'}
          </button>
        </div>
        <p className="text-[11px] text-muted">
          {tr
            ? 'Gövde biçimi: { "tasks": [ { "title", "description"?, "due_date"? (YYYY-MM-DD), "tags"? } ] }. Tek görev için { "title": "…" } da yeterli.'
            : 'Body shape: { "tasks": [ { "title", "description"?, "due_date"? (YYYY-MM-DD), "tags"? } ] }. A single { "title": "…" } also works.'}
        </p>
      </div>
    </div>
  )
}
