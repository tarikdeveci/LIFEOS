import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

/**
 * Belirli aralıkla tazelenen "şu an" Date'i.
 *
 * Arka planda timer'lar kısıtlandığı için foreground'a dönüşte hemen tazeler —
 * aksi halde ekran dakikalar önceki saati göstermeye devam ediyordu.
 *
 * @param intervalMs Tazeleme aralığı. Varsayılan 30sn; dakika değişimini
 *   en fazla 30sn gecikmeyle yakalar.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date())
    })

    return () => {
      clearInterval(timer)
      subscription.remove()
    }
  }, [intervalMs])

  return now
}
