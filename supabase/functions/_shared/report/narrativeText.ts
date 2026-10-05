// Şablon anlatının metin havuzları (Türkçe ve İngilizce). Saf veri.
//
// Yer tutucular: {done} {total} {list} {title} {minutes} {steps} {program} {week}
// {target}. Havuzlar güne göre döner (narrative.ts). Yazım kuralları:
//   - sayıdan sonra ek yok ("7/42'ye" yerine "7/42"), iki nokta ya da virgülle ayrılır
//   - kaçan iş başarısızlık diye çerçevelenmez, sebep suçlamaz
//   - program kaçırılınca sıfırlanmaz, kaldığı yerden devam eder
//   - uzun tire ve orta tire yok

import type { ReportLanguage } from './text.ts'

export interface NarrativeText {
  headline: { empty: string[]; all: string[]; most: string[]; some: string[]; none: string[] }
  wentWell: {
    done: string[]
    soft: string[]
    habit: string[]
    workout: string[]
    minutes: string[]
    steps: string[]
    focus: string[]
    nutrition: string[]
    none: string[]
  }
  note: {
    energy: string[]
    time: string[]
    interrupted: string[]
    not_needed: string[]
    avoided: string[]
    partial: string[]
    skipped: string[]
    open: string[]
    program: string
  }
  suggestion: {
    energy: string[]
    avoided: string[]
    interrupted: string[]
    time: string[]
    leftover: string[]
    steady: string[]
    empty: string[]
  }
  futureSelf: { program: string[]; work: string[]; care: string[]; focus: string[]; generic: string[] }
}

const TR: NarrativeText = {
  headline: {
    empty: ['Bugün takvim sakindi', 'Planlı iş olmayan bir gün', 'Bugün yük hafifti', 'Sakin geçen bir gün'],
    all: [
      'Plan tamam: {done}/{total}',
      'Bugün tuttu: {done}/{total} iş bitti',
      '{total} iş vardı, hepsi tamam',
      'Temiz bir gün: {done}/{total}',
    ],
    most: [
      'Günün büyük kısmı yerinde: {done}/{total}',
      'İyi bir gün: {done}/{total} iş tamam',
      'Çoğu tamam: {done}/{total}',
      'Sağlam ilerleme: {done}/{total}',
    ],
    some: [
      'Küçük ama gerçek ilerleme: {done}/{total}',
      'Bugünkü ilerleme: {done}/{total}, gerisi kendi hızında',
      '{done}/{total} tamam, yeterince iyi bir gün',
      'Bugün {done}/{total}, yarın yeni bir tur',
    ],
    none: [
      'Bugün plan tutmadı, olur',
      'Bugün işler yürümedi, bu bir karne değil',
      'Zor bir gündü, yarın temiz sayfa',
      'Plan bugün dışarıda kaldı, bir günden ibaret',
    ],
  },
  wentWell: {
    done: ['Tamamlananlar: {list}.', 'Bitirdiklerin: {list}.', 'Bugün yapılanlar: {list}.'],
    soft: ['{list} için de zaman ayırdın.', '{list}: bugün kendine de yer açtın.'],
    habit: ['{title}: bu hafta {week}/{target}.', 'Bu hafta {title} için {week}/{target} oldu.'],
    workout: ['Antrenman yapıldı.', 'Bugün antrenman yaptın.', 'Bir antrenman çıkardın.'],
    minutes: ['Hareket: {minutes} dakika.', 'Bugün {minutes} dakika hareket ettin.'],
    steps: ['Adım: {steps}.', 'Bugün {steps} adım attın.'],
    focus: ['Odak: {minutes} dakika.', 'Toplam {minutes} dakika odaklandın.'],
    nutrition: ['Beslenme hedefle uyumluydu.', 'Öğünler hedefe yakın seyretti.'],
    none: [
      'Bugünü kapatıp yarına bakmak da planın parçası.',
      'Bazı günler yalnızca ayakta kalmaya yeter, o da sayılır.',
      'Kayıt azsa da bu rapor yarın için bir başlangıç noktası.',
    ],
  },
  note: {
    energy: ['Enerji düşüktü, bu yeterli bir sebep.', 'Enerji elvermedi, olur.', 'Düşük enerjili günün işi bu kadardı.'],
    time: ['Zaman yetmedi, belki plan fazla yüklüydü.', 'Saat yetmedi: sorun iş değil, takvimdi.', 'Gün dar geldi.'],
    interrupted: ['Araya başka iş girdi, olur.', 'Kesintiye uğradı, plan dışı şeyler çıkar.'],
    not_needed: ['Artık gerekmiyor gibi, listeden çıkarabilirsin.', 'İhtiyaç kalmadı, bu da geçerli bir sonuç.'],
    avoided: ['Biraz uzak durulmuş, yarın yalnızca ilk beş dakika yeter.', 'Zor gelmiş olabilir, tek küçük adım yeter.'],
    partial: ['Yarım kaldı, başladığın yer kaybolmaz.', 'Bir kısmı yapıldı, kalanı sonra gelir.'],
    skipped: ['Bugün olmadı.', 'Bugünlük bırakıldı.'],
    open: ['Açık kaldı.', 'Bugün sıra gelmedi.', 'Bugün yer bulamadı.'],
    program: ' Program yerinde: {program}, kaldığın yerden devam.',
  },
  suggestion: {
    energy: [
      'Yarın tek bir zor iş seç, gerisini hafif sürümle geç.',
      'Yarın enerjin düşükse asgari sürüm yeter, kısa bir adım da sayılır.',
    ],
    avoided: [
      'Uzak durduğun işi yarın en kısa haliyle, günün ilk işi yap.',
      'Yarın o işe yalnızca 10 dakika ver, başlamak en zoru.',
    ],
    interrupted: [
      'Yarın en önemli işi sabaha koy, kesinti gelmeden bitsin.',
      'Yarının planına bir tampon blok ekle, araya girenler orada eritilsin.',
    ],
    time: [
      'Yarın listeyi bugünkünden bir iş kısa tut.',
      'Yarın bloklar arasına tampon bırak, zaman yetmeyen günlerin ilacı bu.',
    ],
    leftover: [
      'Açık kalan en önemli işi yarının ilk bloğuna koy.',
      'Kalanlardan yalnızca birini seç, yarın ona saat ver.',
    ],
    steady: ['Ritim iyi, yarın planı olduğu gibi bırak.', 'Yarın da aynı tempoyu koru, yeni iş ekleme.'],
    empty: ['Yarın için iki dakika ayırıp bir öncelik seç.', 'Yarının tek işini şimdiden belirle.'],
  },
  futureSelf: {
    program: [
      '{title}: {program}. Gelecekteki sen bu adımın üstüne basacak.',
      'Bugünkü oturum bitti, {title} artık {program}. Bu, gelecekteki sana bırakılan bir birikim.',
      '{title} ilerledi: {program}. Gelecekteki sen için sağlam bir adım.',
    ],
    work: [
      '{title} bitti, yarınki sen için bir iş eksildi.',
      'Bugün {title} tamamlandı. Gelecekteki sen bu yükü taşımayacak.',
    ],
    care: [
      '{title}: bugün kendine de yatırım yaptın, gelecekteki sen bunun karşılığını alır.',
      'Kendine {title} için zaman ayırdın, gelecekteki sen teşekkür eder.',
    ],
    focus: [
      '{minutes} dakikalık odak, gelecekteki sen için bir birikim.',
      'Bugünkü {minutes} dakikalık emek yarının işini kolaylaştırır.',
    ],
    generic: [
      'Gelecekteki sen için bugünün işi: yarına hazır girmek.',
      'Bugünü kayda geçirdin, gelecekteki sen bunu bir başlangıç olarak kullanır.',
    ],
  },
}

const EN: NarrativeText = {
  headline: {
    empty: ['A quiet day on the calendar', 'A day with nothing planned', 'A light day today', 'A calm day'],
    all: [
      'Plan done: {done}/{total}',
      'It held today: {done}/{total} finished',
      '{total} planned, all done',
      'A clean day: {done}/{total}',
    ],
    most: [
      'Most of the day landed: {done}/{total}',
      'A good day: {done}/{total} done',
      'Mostly done: {done}/{total}',
      'Solid progress: {done}/{total}',
    ],
    some: [
      'Small but real progress: {done}/{total}',
      'Progress today: {done}/{total}, the rest at its own pace',
      '{done}/{total} done, a good enough day',
      'Today {done}/{total}, tomorrow is a new round',
    ],
    none: [
      'The plan did not hold today, and that is fine',
      'Things did not move today, this is not a scorecard',
      'A hard day, tomorrow is a clean page',
      'The plan stayed outside today, it is just one day',
    ],
  },
  wentWell: {
    done: ['Done: {list}.', 'You finished: {list}.', 'Completed today: {list}.'],
    soft: ['You made room for {list} too.', '{list}: you set time aside for yourself today.'],
    habit: ['{title}: {week}/{target} this week.', 'This week {title} stands at {week}/{target}.'],
    workout: ['Workout done.', 'You trained today.', 'You got a workout in.'],
    minutes: ['Movement: {minutes} minutes.', 'You moved for {minutes} minutes today.'],
    steps: ['Steps: {steps}.', 'You walked {steps} steps today.'],
    focus: ['Focus: {minutes} minutes.', 'You focused for {minutes} minutes in total.'],
    nutrition: ['Eating stayed in line with your target.', 'Meals stayed close to the target.'],
    none: [
      'Closing the day and looking ahead is part of the plan too.',
      'Some days are only about getting through, and that counts.',
      'Even with little logged, this report is a starting point for tomorrow.',
    ],
  },
  note: {
    energy: ['Energy was low, which is reason enough.', 'Energy ran out, that happens.', 'A low energy day gave this much.'],
    time: ['Time ran out, maybe the plan was overloaded.', 'Not enough hours: the calendar was tight, not the task.', 'The day felt narrow.'],
    interrupted: ['Something else came up, that happens.', 'It got interrupted, unplanned things come up.'],
    not_needed: ['Seems no longer needed, you can drop it from the list.', 'It is not needed anymore, a valid outcome too.'],
    avoided: ['Kept at a distance a bit, tomorrow just the first five minutes is enough.', 'It may have felt hard, one small step is enough.'],
    partial: ['Left half done, where you started is not lost.', 'Part of it is done, the rest comes later.'],
    skipped: ['Did not happen today.', 'Set aside for today.'],
    open: ['Still open.', 'Its turn did not come today.', 'It did not find room today.'],
    program: ' The program holds its place: {program}, continuing where you left off.',
  },
  suggestion: {
    energy: [
      'Pick one hard task tomorrow and take the rest in the light version.',
      'If energy is low tomorrow, the minimum version is enough, a short step counts.',
    ],
    avoided: [
      'Give the task you kept away from its shortest form tomorrow, as the first thing of the day.',
      'Give it just 10 minutes tomorrow, starting is the hardest part.',
    ],
    interrupted: [
      'Put the most important task in the morning tomorrow, so it ends before interruptions come.',
      'Add a buffer block to tomorrow, so interruptions can melt away there.',
    ],
    time: [
      "Keep tomorrow's list one task shorter than today's.",
      'Leave buffers between blocks tomorrow, that is the cure for days when time runs out.',
    ],
    leftover: [
      'Put the most important open task into the first block of tomorrow.',
      'Pick just one of the leftovers and give it a time slot tomorrow.',
    ],
    steady: ["The rhythm is good, leave tomorrow's plan as it is.", 'Keep the same pace tomorrow, add nothing new.'],
    empty: ['Spend two minutes on tomorrow and pick one priority.', "Decide tomorrow's single task now."],
  },
  futureSelf: {
    program: [
      '{title}: {program}. Your future self will build on this step.',
      "Today's session is done, {title} now stands at {program}. A reserve left for your future self.",
      '{title} moved forward: {program}. A solid step for your future self.',
    ],
    work: [
      '{title} is done, one less thing for tomorrow you.',
      '{title} was completed today. Your future self will not carry that load.',
    ],
    care: [
      '{title}: you invested in yourself today, your future self gets the return.',
      'You set time aside for {title}, your future self will be thankful.',
    ],
    focus: [
      '{minutes} minutes of focus, a reserve for your future self.',
      "Today's {minutes} minutes of effort make tomorrow's work easier.",
    ],
    generic: [
      "For your future self, today's job is: entering tomorrow ready.",
      'You logged today, your future self will use it as a starting point.',
    ],
  },
}

export const NARRATIVE_TEXT: Readonly<Record<ReportLanguage, NarrativeText>> = { tr: TR, en: EN }
