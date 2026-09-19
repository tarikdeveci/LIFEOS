'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { useLang } from '@/lib/contexts/LangContext'

/**
 * Hesabı kalıcı olarak siler (`delete-account` edge function; mobil profil
 * ekranıyla aynı çağrı). Yanlışlıkla tıklamaya karşı onay kelimesi yazılmadan
 * buton açılmaz.
 */
export function DeleteAccountSection() {
  const router = useRouter()
  const { lang } = useLang()
  const tr = lang === 'tr'
  const confirmWord = tr ? 'SİL' : 'DELETE'
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const armed = confirmText.trim().toLocaleUpperCase(tr ? 'tr-TR' : 'en-US') === confirmWord

  async function handleDelete() {
    if (!armed) return
    setDeleting(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('no session')
      const { error: fnError } = await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {},
      })
      if (fnError) throw fnError
      await supabase.auth.signOut()
      router.replace('/')
      router.refresh()
    } catch {
      setError(tr ? 'Hesap silinemedi. Lütfen daha sonra tekrar dene.' : 'Could not delete the account. Please try again later.')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
      <h2 className="text-lg font-semibold text-danger">{tr ? 'Hesabı kalıcı olarak sil' : 'Delete account permanently'}</h2>
      <p className="text-sm text-muted">
        {tr
          ? 'Görevlerin, planların, beslenme ve antrenman kayıtların, bildirim tercihlerin ve profilin kalıcı olarak silinir. Bu işlem geri alınamaz.'
          : 'Your tasks, plans, nutrition and workout records, notification preferences and profile are permanently deleted. This cannot be undone.'}
      </p>
      <p className="text-xs text-muted">
        {tr
          ? 'Mobil uygulamadan aldığın bir abonelik varsa App Store veya Google Play üzerinden ayrıca iptal etmelisin; hesabı silmek o aboneliği durdurmaz.'
          : 'If you subscribed in the mobile app, cancel it in the App Store or Google Play as well; deleting the account does not stop that subscription.'}
      </p>
      <label className="block text-sm text-primary">
        {tr ? `Onaylamak için ${confirmWord} yaz` : `Type ${confirmWord} to confirm`}
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-danger"
          autoComplete="off"
        />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button variant="danger" size="sm" disabled={!armed} loading={deleting} onClick={() => void handleDelete()}>
        {tr ? 'Hesabımı sil' : 'Delete my account'}
      </Button>
    </div>
  )
}
