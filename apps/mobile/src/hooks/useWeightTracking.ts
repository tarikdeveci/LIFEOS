import { useCallback, useEffect, useState } from 'react'
import { Alert } from 'react-native'
import { todayDate } from '@lifeos/shared'
import type { TdeeProposal } from '@lifeos/shared'
import { applyTdeeProposal, deleteWeightLog, loadAdaptiveTdee, upsertWeightLog } from '@lifeos/shared/supabase'
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
export function useWeightTracking(userId: string, onTargetChanged: () => void) {
  const [state, setState] = useState<WeightLoadState>({ status: 'loading' })
  const [busy, setBusy] = useState<WeightBusy>(null)

  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', data: await loadAdaptiveTdee(supabase, userId) })
    } catch (err) {
      setState({ status: 'error', message: messageOf(err, 'Veri okunamadı') })
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  /** Bugünün tartısını yazar; aynı gün tekrar kaydedilirse üzerine yazar. */
  async function saveWeight(kg: number): Promise<boolean> {
    setBusy('save')
    try {
      await upsertWeightLog(supabase, userId, { date: todayDate(), weight_kg: Math.round(kg * 10) / 10, source: 'manual' })
      await load()
      return true
    } catch (err) {
      Alert.alert('Hata', messageOf(err, 'Kilo kaydedilemedi'))
      return false
    } finally {
      setBusy(null)
    }
  }

  function removeWeight(date: string, label: string) {
    Alert.alert('Tartıyı sil', `${label} kaydı silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy('delete')
            try {
              await deleteWeightLog(supabase, userId, date)
              await load()
            } catch (err) {
              Alert.alert('Hata', messageOf(err, 'Kayıt silinemedi'))
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
      'Kalori hedefini güncelle',
      `Günlük hedefin ${proposal.calories} kcal olacak (protein ${proposal.protein_g} g, karbonhidrat ${proposal.carbs_g} g, yağ ${proposal.fat_g} g).`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Güncelle',
          onPress: () => {
            void (async () => {
              setBusy('apply')
              try {
                await applyTdeeProposal(supabase, userId, proposal)
                onTargetChanged()
                await load()
              } catch (err) {
                Alert.alert('Hata', messageOf(err, 'Hedef güncellenemedi'))
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
