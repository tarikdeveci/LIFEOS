// Uygulama içi puanlama istemi.
//
// NEDEN: App Store sıralaması oy sayısına ve ortalamasına doğrudan bağlı.
// LifeOS aylardır mağazada ve 6 oyu var — çünkü uygulama hiçbir yerde puan
// istemiyordu. Anahtar kelime düzenlemesi bu eksiği kapatmaz: aynı sorguda
// önümüzde çıkan uygulamaların çoğu bizden daha az alakalı ama daha çok oylu.
//
// İstem UCUZ DEĞİL: iOS yılda en fazla üç kez gösterir ve bunu uygulamaya
// bildirmez. Yanlış anda sorulan puan düşük yıldız getirir, ki bu hiç
// sormamaktan kötüdür. Bu yüzden istem yalnızca kullanıcının uygulamadan
// somut değer gördüğü bir andan sonra ve kendi sayaçlarımızla seyreltilerek
// gösterilir.

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as StoreReview from 'expo-store-review'

const COUNT_KEY = 'review/value-moments'
const LAST_KEY = 'review/last-prompt'
const FIRST_KEY = 'review/first-moment'

/** İstemden önce beklenen değer anı sayısı (şu an: kaydedilen öğün). */
const REQUIRED_MOMENTS = 5

/**
 * İlk değer anından sonra beklenen süre. Uygulamayı yeni kurmuş birine puan
 * sorulmaz: henüz bir kanaati yoktur ve istem sistem kotasından düşer.
 */
const MIN_AGE_MS = 3 * 86_400_000

/**
 * İki istem arası en az süre. iOS'un yılda üç sınırının altında kalıyor;
 * amaç kotayı doldurmak değil, aynı kullanıcıyı sıkmamak.
 */
const MIN_GAP_MS = 120 * 86_400_000

/**
 * Kullanıcı uygulamadan değer gördü — sayacı ilerlet, koşullar oluştuysa
 * puanlama istemini göster.
 *
 * Çağıran akışı ASLA bloklamaz ve hata fırlatmaz: puanlama isteği öğün
 * kaydetmenin yan işidir, kaydın kendisini riske atamaz.
 */
export async function recordValueMoment(): Promise<void> {
  try {
    const now = Date.now()
    const [countRaw, lastRaw, firstRaw] = await Promise.all([
      AsyncStorage.getItem(COUNT_KEY),
      AsyncStorage.getItem(LAST_KEY),
      AsyncStorage.getItem(FIRST_KEY),
    ])

    const first = Number(firstRaw) > 0 ? Number(firstRaw) : now
    if (!(Number(firstRaw) > 0)) await AsyncStorage.setItem(FIRST_KEY, String(first))

    const count = (Number(countRaw) || 0) + 1
    await AsyncStorage.setItem(COUNT_KEY, String(count))

    if (count < REQUIRED_MOMENTS) return
    if (now - first < MIN_AGE_MS) return

    const last = Number(lastRaw) || 0
    if (last > 0 && now - last < MIN_GAP_MS) return

    // Cihazda mağaza yoksa (simülatör, bazı kurumsal dağıtımlar) istem çağrısı
    // sessizce hiçbir şey yapar; sayacı boşuna sıfırlamamak için önce sorulur.
    if (!(await StoreReview.isAvailableAsync())) return
    if (!(await StoreReview.hasAction())) return

    // Sayaç istemden ÖNCE sıfırlanır. iOS istemi kendi kotası dolduğunda
    // sessizce yutar ve sonucu bildirmez; sonra sıfırlasaydık sayaç dolu kalır
    // ve her öğün kaydında yeniden denenirdi.
    await AsyncStorage.multiSet([
      [COUNT_KEY, '0'],
      [LAST_KEY, String(now)],
    ])

    await StoreReview.requestReview()
  } catch {
    // Sessiz: puanlama istemi hiçbir akışı bozmamalı.
  }
}
