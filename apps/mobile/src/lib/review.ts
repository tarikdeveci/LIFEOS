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
import { todayDate } from '@lifeos/shared'

const DAYS_KEY = 'review/value-days'
const LAST_DAY_KEY = 'review/last-value-day'
const LAST_KEY = 'review/last-prompt'
const FIRST_KEY = 'review/first-moment'

/**
 * İstemden önce beklenen "değer görülen gün" sayısı.
 *
 * Ham eylem değil GÜN sayılıyor: eskiden 5 öğün isteniyordu ama beş öğün tek
 * oturumda girilebiliyor ve o kullanıcının henüz uygulama hakkında kanaati
 * olmuyor. Üç ayrı günde geri gelmiş biri ise ürünü gerçekten kullanıyor —
 * puanı sorulacak kişi o.
 */
const REQUIRED_DAYS = 3

/**
 * İlk değer anından sonra beklenen süre. Uygulamayı yeni kurmuş birine puan
 * sorulmaz: henüz bir kanaati yoktur ve istem sistem kotasından düşer.
 * REQUIRED_DAYS ile büyük ölçüde örtüşür; saat dilimi kaymalarına karşı durur.
 */
const MIN_AGE_MS = 3 * 86_400_000

/**
 * İki istem arası en az süre. iOS'un yılda üç sınırının altında kalıyor;
 * amaç kotayı doldurmak değil, aynı kullanıcıyı sıkmamak.
 */
const MIN_GAP_MS = 120 * 86_400_000

/**
 * Kullanıcı uygulamadan değer gördü — o günü işaretle, koşullar oluştuysa
 * puanlama istemini göster.
 *
 * Çağrıldığı yerler kullanıcının bir şeyi BİTİRDİĞİ anlar olmalı: öğün
 * kaydetmek, görevi tamamlamak. Ekran açmak veya veri girmeye başlamak değil.
 *
 * Çağıran akışı ASLA bloklamaz ve hata fırlatmaz: puanlama isteği asıl işin
 * yan işidir, işin kendisini riske atamaz.
 */
export async function recordValueMoment(): Promise<void> {
  try {
    const now = Date.now()
    // toISOString() UTC'ye çevirir ve UTC+3'te gece yarısından sonra bir
    // önceki günü verir; todayDate() yerel takvim gününü döndürür.
    const today = todayDate()

    const [daysRaw, lastDayRaw, lastRaw, firstRaw] = await Promise.all([
      AsyncStorage.getItem(DAYS_KEY),
      AsyncStorage.getItem(LAST_DAY_KEY),
      AsyncStorage.getItem(LAST_KEY),
      AsyncStorage.getItem(FIRST_KEY),
    ])

    // Aynı gün içindeki ikinci, üçüncü değer anı sayacı ilerletmez.
    if (lastDayRaw === today) return

    const first = Number(firstRaw) > 0 ? Number(firstRaw) : now
    if (!(Number(firstRaw) > 0)) await AsyncStorage.setItem(FIRST_KEY, String(first))

    const days = (Number(daysRaw) || 0) + 1
    await AsyncStorage.multiSet([
      [DAYS_KEY, String(days)],
      [LAST_DAY_KEY, today],
    ])

    if (days < REQUIRED_DAYS) return
    if (now - first < MIN_AGE_MS) return

    const last = Number(lastRaw) || 0
    if (last > 0 && now - last < MIN_GAP_MS) return

    // Cihazda mağaza yoksa (simülatör, bazı kurumsal dağıtımlar) istem çağrısı
    // sessizce hiçbir şey yapar; sayacı boşuna sıfırlamamak için önce sorulur.
    if (!(await StoreReview.isAvailableAsync())) return
    if (!(await StoreReview.hasAction())) return

    // Sayaç istemden ÖNCE sıfırlanır. iOS istemi kendi kotası dolduğunda
    // sessizce yutar ve sonucu bildirmez; sonra sıfırlasaydık sayaç dolu kalır
    // ve her değer anında yeniden denenirdi.
    await AsyncStorage.multiSet([
      [DAYS_KEY, '0'],
      [LAST_KEY, String(now)],
    ])

    await StoreReview.requestReview()
  } catch {
    // Sessiz: puanlama istemi hiçbir akışı bozmamalı.
  }
}
