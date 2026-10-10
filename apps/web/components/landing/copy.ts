import type { Language } from '@/lib/i18n'

// Tanıtım sayfasının etkileşimli bölümlerine ait metinler. Ortak i18n dosyası
// 1500 satırı aştı; yalnız bu sayfada kullanılan metinler burada duruyor.
// Fiyat, SSS, mobil ve alt bilgi metinleri lib/i18n.ts'den gelmeye devam ediyor.

export type BlockType = 'routine' | 'focus' | 'task' | 'meal' | 'workout'
export type MuscleMode = 'balance' | 'recovery' | 'strength'

export interface LandingCopy {
  hero_scroll: string
  ruler_title: string
  ruler_now: string
  ruler_blocks: readonly { label: string; type: BlockType }[]
  wsjf_eyebrow: string
  wsjf_title: string
  wsjf_desc: string
  wsjf_hint: string
  wsjf_formula: string
  wsjf_value: string
  wsjf_urgency: string
  wsjf_risk: string
  wsjf_effort: string
  wsjf_friction: string
  wsjf_levels: Record<'critical' | 'high' | 'medium' | 'low', string>
  wsjf_tasks: readonly string[]
  build_eyebrow: string
  build_steps: readonly { title: string; desc: string }[]
  build_pool: string
  build_late: string
  build_shifted: string
  muscle_eyebrow: string
  muscle_title: string
  muscle_desc: string
  muscle_tabs: readonly { key: MuscleMode; label: string; desc: string }[]
  muscle_alt: string
  muscle_free: string
  mobile_tilt_hint: string
}

const tr: LandingCopy = {
  hero_scroll: 'Kaydır, günün nasıl kurulduğunu gör',
  ruler_title: 'Bugün',
  ruler_now: 'Şimdi',
  ruler_blocks: [
    { label: 'Sabah rutini', type: 'routine' },
    { label: 'Derin iş: sunum', type: 'focus' },
    { label: 'Ekip toplantısı', type: 'task' },
    { label: 'Öğle yemeği', type: 'meal' },
    { label: 'E-postalar', type: 'task' },
    { label: 'Antrenman', type: 'workout' },
    { label: 'Akşam yemeği', type: 'meal' },
  ],

  wsjf_eyebrow: '01 · Sırala',
  wsjf_title: 'Önce neyin yapılacağını sen değil, puan söylesin.',
  wsjf_desc: 'Her görevin değeri, aciliyeti ve riski çabaya ve engele bölünür. Kaydırıcıları oynat, liste kendini yeniden sıralasın.',
  wsjf_hint: 'Bir görev seç, puanlarını değiştir.',
  wsjf_formula: 'Öncelik',
  wsjf_value: 'Değer',
  wsjf_urgency: 'Aciliyet',
  wsjf_risk: 'Risk',
  wsjf_effort: 'Çaba',
  wsjf_friction: 'Engel',
  wsjf_levels: { critical: 'Kritik', high: 'Yüksek', medium: 'Orta', low: 'Düşük' },
  wsjf_tasks: [
    'Vergi beyannamesini gönder',
    'Sunum slaytlarını bitir',
    'Doktor randevusu al',
    'Mutfak dolabını düzenle',
  ],

  build_eyebrow: '02 · Yerleştir',
  build_steps: [
    { title: 'Sırala', desc: 'En yüksek puanlı görev en üste çıkar. Ne yapacağını düşünmekle vakit kaybetmezsin.' },
    { title: 'Takvime yerleştir', desc: 'Görevler boş saatlerine blok olarak oturur. Öğün ve antrenman da aynı günün içinde.' },
    { title: 'Kayınca yeniden kur', desc: 'Toplantı uzadı mı? "Geciktim" de, bitmemiş bloklar zincirleme kayar. Plan dağılmaz.' },
  ],
  build_pool: 'Sıradaki görevler',
  build_late: 'Toplantı 30 dk uzadı',
  build_shifted: 'Kalan bloklar kaydırıldı',

  muscle_eyebrow: '03 · Toparlan',
  muscle_title: 'Hangi kasın hazır, hangisi yorgun: tek bakışta.',
  muscle_desc: 'Kaydettiğin her set kas haritasına işlenir. Uygulamadaki ekranın kendisi, süs yok.',
  muscle_tabs: [
    { key: 'balance', label: 'Denge', desc: 'Son 30 günde hangi kası ne kadar çalıştırdığını gösterir. Unuttuğun bölge hemen göze çarpar.' },
    { key: 'recovery', label: 'Toparlanma', desc: 'Dün yüklendiğin kas kırmızı, hazır olan yeşil. Bugün neyi çalıştıracağına buna bakarak karar ver.' },
    { key: 'strength', label: 'Güç', desc: 'Uzun süredir çalıştırmadığın kasın gücü düşmeye başlar. Risk altındaki bölgeyi önceden gör.' },
  ],
  muscle_alt: 'LifeOS kas haritası',
  muscle_free: 'Ücretsiz planda',

  mobile_tilt_hint: 'İmleci telefonların üstünde gezdir',
}

const en: LandingCopy = {
  hero_scroll: 'Scroll to watch the day get built',
  ruler_title: 'Today',
  ruler_now: 'Now',
  ruler_blocks: [
    { label: 'Morning routine', type: 'routine' },
    { label: 'Deep work: deck', type: 'focus' },
    { label: 'Team meeting', type: 'task' },
    { label: 'Lunch', type: 'meal' },
    { label: 'Emails', type: 'task' },
    { label: 'Workout', type: 'workout' },
    { label: 'Dinner', type: 'meal' },
  ],

  wsjf_eyebrow: '01 · Rank',
  wsjf_title: 'Let the score decide what comes first, not your mood.',
  wsjf_desc: 'Each task’s value, urgency and risk are divided by its effort and friction. Move the sliders and watch the list reorder itself.',
  wsjf_hint: 'Pick a task, change its scores.',
  wsjf_formula: 'Priority',
  wsjf_value: 'Value',
  wsjf_urgency: 'Urgency',
  wsjf_risk: 'Risk',
  wsjf_effort: 'Effort',
  wsjf_friction: 'Friction',
  wsjf_levels: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' },
  wsjf_tasks: [
    'File the tax return',
    'Finish the slide deck',
    'Book a doctor visit',
    'Sort the kitchen cabinet',
  ],

  build_eyebrow: '02 · Place',
  build_steps: [
    { title: 'Rank', desc: 'The highest scoring task rises to the top. No time lost deciding what to do.' },
    { title: 'Drop into the calendar', desc: 'Tasks land in your free hours as blocks. Meals and workouts live in the same day.' },
    { title: 'Rebuild when it slips', desc: 'Meeting ran long? Tap "I’m late" and unfinished blocks shift down in a chain. The plan holds.' },
  ],
  build_pool: 'Up next',
  build_late: 'Meeting ran 30 min over',
  build_shifted: 'Remaining blocks shifted',

  muscle_eyebrow: '03 · Recover',
  muscle_title: 'Which muscles are ready, which are tired: at a glance.',
  muscle_desc: 'Every set you log is painted onto the muscle map. This is the real screen from the app (Turkish labels).',
  muscle_tabs: [
    { key: 'balance', label: 'Balance', desc: 'How much you trained each muscle over the last 30 days. The area you keep skipping stands out.' },
    { key: 'recovery', label: 'Recovery', desc: 'Yesterday’s muscles are red, rested ones green. Pick today’s session by looking at it.' },
    { key: 'strength', label: 'Strength', desc: 'Strength starts to fade on muscles you have not trained in a while. See the at-risk area early.' },
  ],
  muscle_alt: 'LifeOS muscle map',
  muscle_free: 'On the free plan',

  mobile_tilt_hint: 'Move your cursor over the phones',
}

export function getLandingCopy(lang: Language): LandingCopy {
  return lang === 'tr' ? tr : en
}
