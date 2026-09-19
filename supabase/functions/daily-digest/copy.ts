// Günlük bildirim metinleri. Saf fonksiyonlar: veriyi alır, başlık ve gövde döner;
// veritabanına dokunmaz, bu yüzden Deno olmadan da denenebilir.
//
// Neden çeşitlilik: her gün aynı saatte aynı cümle birkaç gün sonra okunmaz olur
// ve kullanıcı bildirimleri toptan kapatır. Saat sabit kalıyor (alışkanlık
// tutarlı bir tetikleyiciye bağlanır); değişen içerik: haftanın günü, kullanıcının
// o günkü verisi ve dönen metin havuzu.
//
// Seçim deterministik: aynı kullanıcı aynı gün hep aynı metni alır (cron yeniden
// denerse metin değişmez), ertesi gün havuzda bir sonraki metne geçer. Başlık ve
// gövde havuzlarının boyları farklı tutuldu ki aynı ikili sık tekrarlanmasın.
//
// Yazım: sayıdan sonra ek yok ("%40'ı", "09:00'da" sayıya göre değişir ve
// kolayca yanlış çıkar); kilo, boy ya da yenen miktar için yargılayıcı dil yok.

import type { StreakSummary } from '../_shared/streak.ts'

export interface Copy {
  title: string
  body: string
}

/** Bir kullanıcının bir günü: metin seçiminin tek girdisi. */
export interface DayContext {
  /** Gün numarası + kullanıcıya özgü sabit kaydırma. */
  seed: number
  /** 0 = Pazar ... 6 = Cumartesi, kullanıcının yerel gününe göre. */
  weekday: number
}

export interface MorningData {
  blockCount: number
  /** Şu andan sonraki ilk blok; saat 'HH:MM'. */
  firstBlock: { label: string; start: string } | null
  /** Takvim boşken önerilecek en yüksek öncelikli açık görev. */
  topTask: string | null
  streak: StreakSummary | null
}

export interface MiddayData {
  remainingBlocks: number
  mealCount: number
  kcal: number
  targetKcal: number | null
}

export interface EveningData {
  mealCount: number
  kcal: number
  protein: number
  targetKcal: number | null
  targetProtein: number | null
  tomorrowBlocks: number
}

export interface WeightData {
  /** Bugünden önceki son tartı; hiç yoksa null. */
  lastKg: number | null
  daysSinceLast: number | null
  /** Dünden geriye kesintisiz tartılan gün sayısı. */
  streakDays: number
}

const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

export function dayIndex(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000)
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}

/** Kullanıcılar aynı gün aynı metni görmesin diye uid'den türeyen sabit kaydırma. */
function userOffset(uid: string): number {
  let h = 0
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0
  return h % 1009
}

export function dayContext(uid: string, date: string): DayContext {
  return { seed: dayIndex(date) + userOffset(uid), weekday: weekdayOf(date) }
}

function pick<T>(list: readonly T[], seed: number): T {
  const item = list[((seed % list.length) + list.length) % list.length]
  if (item === undefined) throw new Error('bos metin havuzu')
  return item
}

/**
 * Haftanın gününe özel başlık varsa her iki haftada bir onu kullanır: aynı
 * günün ardışık haftaları seed'de 7 fark eder, tek/çift sırayla değişir.
 */
function withWeekday(special: string | null, pool: readonly string[], ctx: DayContext): string {
  return special !== null && ctx.seed % 2 === 0 ? special : pick(pool, ctx.seed)
}

function kg(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace('.', ',')
}

function clip(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

function lines(...parts: Array<string | null>): string {
  return parts.filter((p): p is string => p !== null && p !== '').join('\n')
}

// Sabah

function streakText(streak: StreakSummary | null, seed: number): string | null {
  // İki haftanın altındaki seri duyurulmuyor: her yeni kullanıcıya rozet
  // göstermek sayıyı değersizleştirir.
  if (!streak || streak.weeks < 2) return null
  const w = streak.weeks
  return streak.atRisk
    ? pick([
        `${w} haftalık serin bu haftanın ilk antrenmanını bekliyor.`,
        `Serin ${w} haftada. Bu hafta tek bir antrenman onu korur.`,
        `${w} haftadır aralıksız devam ediyorsun, bu hafta da bir antrenman yeter.`,
      ], seed)
    : pick([
        `${w} haftadır aralıksız spordasın. 🔥`,
        `Antrenman serin ${w}. haftasında, böyle devam.`,
        `${w} haftalık seri: istikrar tam olarak böyle görünür.`,
      ], seed)
}

function morningTitle(d: MorningData, ctx: DayContext): string {
  const n = d.blockCount
  if (n === 0) {
    const special = ctx.weekday === 1 ? 'Yeni hafta, boş bir sayfa'
      : ctx.weekday === 0 || ctx.weekday === 6 ? 'Hafta sonu, takvim serbest'
      : null
    return withWeekday(special, [
      'Günaydın, takvim bugün boş',
      'Bugün planlanmış blok yok',
      `Plansız bir ${WEEKDAYS[ctx.weekday]}`,
      'Günaydın ☀️ Bugün senin',
    ], ctx)
  }
  const special = ctx.weekday === 1 ? `Yeni haftaya ${n} blokla başlıyorsun`
    : ctx.weekday === 5 ? `Cuma geldi, son düzlükte ${n} blok var`
    : ctx.weekday === 0 || ctx.weekday === 6 ? `Hafta sonu planın: ${n} blok`
    : null
  return withWeekday(special, [
    `Günaydın! Bugün ${n} blok var`,
    `Bugünün planı hazır: ${n} blok`,
    `${WEEKDAYS[ctx.weekday]} planın: ${n} blok`,
    `Takvimde ${n} blok seni bekliyor`,
    `Günaydın ☀️ ${n} blokluk bir gün`,
  ], ctx)
}

function morningBody(d: MorningData, ctx: DayContext): string {
  if (d.firstBlock) {
    const label = clip(d.firstBlock.label, 50)
    const at = d.firstBlock.start
    return pick([
      `İlk blok ${at}: ${label}`,
      `Gün ${label} ile açılıyor (${at}).`,
      `Sıradaki durak: ${label}, saat ${at}.`,
      `Saat ${at}, ${label}. Gerisi sırayla gelir.`,
    ], ctx.seed)
  }
  if (d.blockCount > 0) return 'Bugünkü bloklar planlayıcıda seni bekliyor.'
  if (d.topTask) {
    const task = clip(d.topTask, 60)
    return pick([
      `Listende en üstte “${task}” var. Ona bir blok ayırmaya ne dersin?`,
      `Bugün tek bir şey yapacaksan: “${task}”.`,
      `Öncelik sıralamana göre günün işi: “${task}”.`,
    ], ctx.seed)
  }
  return pick([
    'İki dakikalık bir plan günün geri kalanını kolaylaştırır.',
    'Tek bir odak bloğu eklemek bile günü toparlar.',
    'Bugün neye zaman ayırmak istersin? Planlayıcı hazır.',
  ], ctx.seed)
}

export function morningCopy(d: MorningData, ctx: DayContext): Copy {
  return { title: morningTitle(d, ctx), body: lines(morningBody(d, ctx), streakText(d.streak, ctx.seed)) }
}

// Öğlen

export function middayCopy(d: MiddayData, ctx: DayContext): Copy {
  const r = d.remainingBlocks
  const title = r > 0
    ? pick([
        `Öğlen kontrolü: ${r} blok kaldı`,
        `Günün ikinci yarısında ${r} blok var`,
        `Yarı yoldasın, önünde ${r} blok var`,
        `Öğleden sonra için ${r} blok`,
      ], ctx.seed)
    : pick(['Öğlen kontrolü', 'Günün yarısı geride', 'Öğle arası', 'Kısa bir mola hatırlatması'], ctx.seed)

  let body: string
  if (d.mealCount === 0) {
    body = pick([
      'Henüz öğün girmedin. Şimdi yazarsan akşam hatırlamaya çalışmazsın.',
      'Kahvaltı ve öğle yemeğini eklemek bir dakika sürer.',
      'Bugünün ilk öğününü ekle, günün hesabı şimdiden tutsun.',
    ], ctx.seed)
  } else if (d.targetKcal) {
    const left = d.targetKcal - d.kcal
    const pct = Math.round((d.kcal / d.targetKcal) * 100)
    body = left > 0
      ? pick([
          `${d.kcal} kcal aldın, hedefe ${left} kcal var.`,
          `Şu ana kadar ${d.kcal} kcal, hedefin %${pct} kadarı.`,
          `Günün yarısında ${d.kcal} kcal. Akşama ${left} kcal alan kaldı.`,
        ], ctx.seed)
      : pick([
          `Bugünkü hedef ${d.kcal} kcal ile dolmuş görünüyor. Akşam hafif seçenekler iyi gider.`,
          `${d.kcal} kcal ile hedefe ulaştın. Günün geri kalanını hafif tutmak dengeyi kurar.`,
        ], ctx.seed)
  } else {
    body = pick([`Şu ana kadar ${d.kcal} kcal kaydettin.`, `Bugün ${d.kcal} kcal aldın.`], ctx.seed)
  }
  return { title, body }
}

// Akşam

/** Öğün girilmemiş günde null: söylenecek bir şey yok, suçlamak da istemiyoruz. */
export function eveningCopy(d: EveningData, ctx: DayContext): Copy | null {
  if (d.mealCount === 0) return null
  const p = Math.round(d.protein)

  const special = ctx.weekday === 5 ? 'Haftanın iş günleri tamam'
    : ctx.weekday === 0 ? 'Yeni haftaya hazırlık'
    : null
  const title = withWeekday(special, ['Günün özeti', 'Gün kapanışı', 'Bugün nasıl geçti?', 'Akşam özeti 🌙', 'Bugünün kısa özeti'], ctx)

  const pct = d.targetKcal ? Math.round((d.kcal / d.targetKcal) * 100) : null
  const numbers = pick([
    `${d.kcal} kcal ve ${p} g protein aldın.`,
    `Bugün: ${d.kcal} kcal, ${p} g protein.`,
    `Toplam ${d.kcal} kcal, ${p} g protein.`,
  ], ctx.seed) + (pct !== null ? ` Hedefin %${pct} kadarı.` : '')

  let insight: string | null = null
  if (d.targetProtein && p >= d.targetProtein) {
    insight = pick(['Protein hedefini tutturdun. 💪', 'Protein tamam, kasların memnun.'], ctx.seed)
  } else if (pct !== null && pct >= 90 && pct <= 110) {
    insight = pick(['Hedefe neredeyse tam isabet.', 'Kalori hedefiyle uyumlu bir gün.'], ctx.seed)
  } else if (pct !== null && pct < 70) {
    insight = 'Eklemediğin bir öğün varsa şimdi girmek hesabı doğru tutar.'
  } else if (pct !== null && pct > 115) {
    insight = pick([
      'Hedefin biraz üstünde bir gün. Tek gün değil, haftalık ortalama belirleyici.',
      'Bugün biraz fazla oldu, sorun değil. Yarın yeni bir gün.',
    ], ctx.seed)
  } else if (d.tomorrowBlocks === 0) {
    insight = pick([
      'Yarın için plan yok. İki dakika ayırırsan sabah hazır başlarsın.',
      'Yarının takvimi boş, şimdi bir blok eklemek sabahı kolaylaştırır.',
    ], ctx.seed)
  }

  return { title, body: lines(numbers, insight) }
}

// Tartı

/** Tek başına giden tartı hatırlatması. */
export function weightCopy(d: WeightData, ctx: DayContext): Copy {
  if (d.lastKg === null) {
    return {
      title: pick(['Tartı zamanı', 'Kilo takibine başla', 'İlk tartını ekle'], ctx.seed),
      body: pick([
        'Sabah, kahvaltıdan önce tartılmak en tutarlı sonucu verir. Kaydetmek birkaç saniye.',
        'Kilo grafiğin ilk tartınla başlar.',
      ], ctx.seed),
    }
  }
  if (d.daysSinceLast !== null && d.daysSinceLast > 3) {
    return {
      title: pick(['Tartıya geri dönüş', 'Kısa bir tartı molası', 'Terazi seni özledi'], ctx.seed),
      body: pick([
        'Ara vermek sorun değil. Bugünkü tartı grafiği yeniden canlandırır.',
        `Son tartın ${d.daysSinceLast} gün önceydi. Bugün bir tartı trendi yeniden netleştirir.`,
      ], ctx.seed),
    }
  }
  if (d.streakDays >= 3) {
    return {
      title: pick([`Tartı serin ${d.streakDays} gün`, `${d.streakDays} gündür aksatmadın`], ctx.seed),
      body: pick(['Bugün de ekle, trend çizgisi netleşiyor.', 'Seriyi bugün de sürdür, kaydetmek birkaç saniye.'], ctx.seed),
    }
  }
  return {
    title: withWeekday(ctx.weekday === 1 ? 'Haftanın ilk tartısı' : null, ['Tartı vakti', 'Günaydın, tartı zamanı', 'Sabah tartısı', 'Terazi seni bekliyor'], ctx),
    body: pick([
      `Son tartın ${kg(d.lastKg)} kg. Bugünkü değeri ekleyince trend güncellenir.`,
      'Günlük dalgalanma normal; asıl hikayeyi trend çizgisi anlatır.',
      'Her gün aynı saatte tartılmak trendi netleştirir.',
    ], ctx.seed),
  }
}

/** Tartı saati başka bir slotla çakışınca o bildirime eklenen tek satır. */
export function weightLine(d: WeightData, ctx: DayContext): string {
  if (d.lastKg === null) return 'Bir de tartı: ilk kilonu eklersen grafiğin başlar.'
  if (d.streakDays >= 3) return `Tartı serin ${d.streakDays} gün, bugünkünü de ekle.`
  return pick([
    'Tartıldıysan kilonu eklemeyi unutma.',
    'Bir de tartı: bugünkü kilonu eklemek birkaç saniye.',
    'Sabah tartısını da ekle, trend güncel kalsın.',
  ], ctx.seed)
}

export function withWeightLine(content: Copy, d: WeightData, ctx: DayContext): Copy {
  return { title: content.title, body: lines(content.body, weightLine(d, ctx)) }
}
