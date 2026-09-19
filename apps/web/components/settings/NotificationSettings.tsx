'use client'

import { useCallback, useEffect, useState } from 'react'
import { BLOCK_REMINDER_CHOICES, type PushPreferences, type PushPreferencesUpdate } from '@lifeos/shared'
import { getPushPreferences, updatePushPreferences } from '@lifeos/shared/supabase'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { useLang } from '@/lib/contexts/LangContext'

interface NotificationSettingsProps { userId: string }

interface SlotRow {
  key: 'morning' | 'midday' | 'evening'
  title: string
  description: string
  enabled: boolean
  hour: number
  toggle: (next: boolean) => PushPreferencesUpdate
  setHour: (hour: number) => PushPreferencesUpdate
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

interface SwitchProps { checked: boolean; label: string; onChange: (next: boolean) => void }

function Switch({ checked, label, onChange }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-border'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

/**
 * Push bildirim tercihleri. daily-digest ve event-notifications bu tabloyu
 * (`notification_preferences`) okur; mobildeki ayar ekranıyla aynı satır.
 * Eskiden web `user_profiles.preferences` içine yazıyordu ve bildirimlere hiç
 * etki etmiyordu.
 */
export function NotificationSettings({ userId }: NotificationSettingsProps) {
  const { t } = useLang()
  const { showToast } = useToast()
  const [prefs, setPrefs] = useState<PushPreferences | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const loaded = await getPushPreferences(supabase, userId)
        if (active) setPrefs(loaded)
      } catch {
        if (active) setLoadFailed(true)
      }
    })()
    return () => { active = false }
  }, [userId])

  // Anında kaydeder; yazma başarısız olursa önceki değere döner.
  const patch = useCallback(async (update: PushPreferencesUpdate) => {
    if (!prefs) return
    const previous = prefs
    setPrefs({ ...prefs, ...update })
    try {
      await updatePushPreferences(supabase, userId, update)
    } catch {
      setPrefs(previous)
      showToast(t.settings_notif_save_error, 'error')
    }
  }, [prefs, userId, showToast, t.settings_notif_save_error])

  if (loadFailed) {
    return <p className="text-sm text-danger">{t.settings_notif_load_error}</p>
  }
  if (!prefs) {
    return <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
  }

  const slots: SlotRow[] = [
    {
      key: 'morning', title: t.settings_notif_morning, description: t.settings_notif_morning_desc,
      enabled: prefs.morning_enabled, hour: prefs.morning_hour,
      toggle: (next) => ({ morning_enabled: next }), setHour: (hour) => ({ morning_hour: hour }),
    },
    {
      key: 'midday', title: t.settings_notif_midday, description: t.settings_notif_midday_desc,
      enabled: prefs.midday_enabled, hour: prefs.midday_hour,
      toggle: (next) => ({ midday_enabled: next }), setHour: (hour) => ({ midday_hour: hour }),
    },
    {
      key: 'evening', title: t.settings_notif_evening, description: t.settings_notif_evening_desc,
      enabled: prefs.evening_enabled, hour: prefs.evening_hour,
      toggle: (next) => ({ evening_enabled: next }), setHour: (hour) => ({ evening_hour: hour }),
    },
  ]

  return (
    <div className="space-y-4">
      {slots.map((slot) => (
        <div key={slot.key} className="flex items-center gap-4 rounded-xl border border-border/60 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-primary">{slot.title}</p>
            <p className="text-xs text-muted">{slot.description}</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted">
            {t.settings_notif_hour}
            <select value={slot.hour} disabled={!slot.enabled}
              onChange={(e) => void patch(slot.setHour(Number(e.target.value)))}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm text-primary disabled:opacity-40">
              {HOURS.map((hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
            </select>
          </label>
          <Switch checked={slot.enabled} label={slot.title} onChange={(next) => void patch(slot.toggle(next))} />
        </div>
      ))}

      <div className="rounded-xl border border-border/60 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-primary">{t.settings_notif_block}</p>
            <p className="text-xs text-muted">{t.settings_notif_block_desc}</p>
          </div>
          <Switch checked={prefs.block_reminder_enabled} label={t.settings_notif_block}
            onChange={(next) => void patch({ block_reminder_enabled: next })} />
        </div>
        <div className={`mt-3 flex gap-2 ${prefs.block_reminder_enabled ? '' : 'pointer-events-none opacity-40'}`}>
          {BLOCK_REMINDER_CHOICES.map((minutes) => (
            <button key={minutes} type="button" onClick={() => void patch({ block_reminder_minutes: minutes })}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                prefs.block_reminder_minutes === minutes
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-muted hover:text-primary'
              }`}>
              {minutes} {t.settings_notif_minutes}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted">
        {t.settings_notif_note} {t.settings_notif_timezone}: <span className="font-medium text-primary">{prefs.timezone}</span>
      </p>
    </div>
  )
}
