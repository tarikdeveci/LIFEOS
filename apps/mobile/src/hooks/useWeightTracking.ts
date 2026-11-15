import { useLang } from '../contexts/LangContext'
import { useCallback, useEffect, useState } from 'react'
import { Alert } from 'react-native'
import { todayDate } from '@lifeos/shared'
import type { TdeeProposal } from '@lifeos/shared'
import { applyTdeeProposal, deleteWeightLog, loadAdaptiveTdee, patchProfilePreferences, upsertWeightLog } from '@lifeos/shared/supabase'
import type { AdaptiveTdeeData } from '@lifeos/shared/supabase'
import { supabase } from '../lib/supabase'

export type WeightLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: AdaptiveTdeeData }

export type WeightBusy = 'save' | 'delete' | 'apply' | null

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Kilo kartının verisi ve yazma işlemleri. Her yazmadan sonra tahmin yeniden
 * hesaplanır: yeni tartı hem grafiği hem harcama tahminini değiştirir.
 */
export function useWeightTracking(userId: string, onDataChanged: () => void) {
  const { t } = useLang()
  const [state, setState] = useState<WeightLoadState>({ status: 'loading' })
  const [busy, setBusy] = useState<WeightBusy>(null)

  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', data: await loadAdaptiveTdee(supabase, userId) })
    } catch (err) {
      setState({ status: 'error', message: messageOf(err, t.nut_err_read) })
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  /** Bugünün tartısını yazar, profildeki kiloyu da aynı değere çeker; aynı gün tekrar kaydedilirse üzerine yazar. */
  async function saveWeight(kg: number): Promise<boolean> {
    setBusy('save')
    try {
      const weightKg = Math.round(kg * 10) / 10
      await upsertWeightLog(supabase, userId, { date: todayDate(), weight_kg: weightKg, source: 'manual' })
      await patchProfilePreferences(supabase, userId, { body_weight_kg: weightKg })
      await load()
      onDataChanged()
      return true
    } catch (err) {
      Alert.alert(t.nut_err_add_food_title, messageOf(err, t.nut_err_save_kg))
      return false
    } finally {
      setBusy(null)
    }
  }

  function removeWeight(date: string, label: string) {
    Alert.alert(t.nut_adaptive_del_title, t.nut_adaptive_del_msg.replace('{date}', label), [
      { text: t.nut_give_up, style: 'cancel' },
      {
        text: t.nut_delete,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy('delete')
            try {
              await deleteWeightLog(supabase, userId, date)
              await load()
            } catch (err) {
              Alert.alert(t.nut_err_add_food_title, messageOf(err, t.nut_adaptive_del_err_msg))
            } finally {
              setBusy(null)
            }
          })()
        },
      },
    ])
  }

  function applyProposal(proposal: TdeeProposal) {
    Alert.alert(
      t.nut_adaptive_upd_title,
      t.nut_adaptive_upd_msg.replace('{kcal}', String(proposal.calories)).replace('{p}', String(proposal.protein_g)).replace('{c}', String(proposal.carbs_g)).replace('{f}', String(proposal.fat_g)),
      [
        { text: t.nut_give_up, style: 'cancel' },
        {
          text: t.nut_update,
          onPress: () => {
            void (async () => {
              setBusy('apply')
              try {
                await applyTdeeProposal(supabase, userId, proposal)
                onDataChanged()
                await load()
              } catch (err) {
                Alert.alert(t.nut_err_add_food_title, messageOf(err, t.nut_adaptive_upd_err_msg))
              } finally {
                setBusy(null)
              }
            })()
          },
        },
      ],
    )
  }

  return { state, busy, saveWeight, removeWeight, applyProposal }
}
