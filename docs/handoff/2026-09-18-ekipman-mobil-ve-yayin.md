# Devir teslim: ekipman özelliği (mobil kaldı) + beslenme düzeltmeleri (2026-09-18)

Bu dosya `2026-09-16-ekipman-ve-beslenme.md` dosyasının yerini alır (o dosya silindi, içindeki gerekli bilgi burada).

## Görev

Kullanıcının isteği (kendi cümlesiyle): "lifeos e yeni ozellik ekleyelim spor aletlerini tek tek sectirelim kullanıcının erisimi oldugu programları da ona gore optimize etsin veyahut ona gore program eklesin bi de besin tarafı hala dogru calısmıyor olabilir bi check et orayı"

1. Kullanıcı erişebildiği spor aletlerini tek tek seçsin; programlar bu ekipmana göre uyarlansın ya da ekipmana uygun program eklensin.
2. Beslenme tarafını kontrol et ve düzelt.

Kurallar: uzun/orta tire yok (kod yorumu dahil), dosyalar 500 satır altı, commit'e Co-Authored-By ekleme, prod'a dokunan her adım (db push, function deploy, prod veri silme/düzeltme) için önce kullanıcı onayı, TürKomp verisi kullanılmaz.

## Tamamlananlar

Hiçbir şey commit edilmedi, prod'a hiçbir şey yazılmadı ve deploy edilmedi.

### Beslenme (kod bitti, simülasyonla doğrulandı)

- `supabase/migrations/046_nutrition_catalog_fixes.sql` (yeni): 32 satırın 100 g değerini porsiyona çeviren UPDATE (süt, yoğurt, meyveler, balık/et, pişmiş tahıllar, sebzeler, meyve suları; eski değer eşleşmesiyle korumalı), "Protein shake" toz satırı "Protein tozu (whey)" olarak yeniden adlandırıldı ve alias çakışması giderildi, 3 yeni satır (Etli taze fasulye, Zeytinyağlı taze fasulye, Pastırmalı tost), `food_items.portion_count` kolonu (dolma/sarma gibi sayılabilir yemeklerde 1 porsiyon kaç adet), `meals_items_not_empty` CHECK (NOT VALID).
- `supabase/functions/_shared/nutrition/{types,refs,repo,portion,resolve}.ts`: `portionCount` desteği; `resolve.ts` içinde `isStaleAlias` (kullanıcı alias'ı, kelimesi kelimesine eşleşen başka global satır varken ve hedef satırın kendi adlarında bu ifade yoksa yok sayılır).
- `supabase/functions/_shared/nutrition/adapters/anthropic.ts`: kullanıcı yemeğin malzemelerini açıkça sayarsa yalnızca malzemeler çıkarılır (pancake çift sayımı).
- `packages/shared/src/supabase/nutrition.ts`: `EmptyMealError`; `createMeal`/`updateMeal` boş kalemle kayıt yapmaz (0 kcal boş öğünler eski v1.0 istemcisinden geliyordu).
- `scripts/nutrition-eval/cases.json` R01-R08 vakaları, `run.ts` vaka başına `user_aliases` desteği ve `portion_count` kolonu.
- Simülasyon (046 uygulanmış katalog kopyasıyla): geçme %98.4, tek hata eskiden beri olan X05 "krema". 046 öncesi canlı katalogda yeni 8 vakanın 7'si kalıyordu.

### Ekipman: veritabanı, paylaşılan paket, AI koç (bitti)

- `supabase/migrations/047_exercise_equipment.sql` (yeni, 359 satır): `exercises.equipment TEXT[]` (NULL = bilinmiyor, süzülmez; `{}` = alet gerekmez) + `exercises_equipment_known` CHECK (24 anahtar). Vücut ağırlığı satırları `{}`, 152 satır açık isim listesiyle atandı (tüm isimler canlı katalogla karşılaştırıldı, eksik yok; NULL kalanlar: Bisiklet, Foam Rolling, Ağırlıklı Plank, Trampolin, Hula Hoop). 3 global şablon: "Evde Vücut Ağırlığı: Tüm Vücut" (3 gün), "Evde Dambıl: Tüm Vücut" (3 gün), "Evde Dambıl: Üst/Alt" (4 gün); şablondaki 58 hareket adının hepsi katalogda var. `seed_add_program_exercise` yeniden kuruluyor ve sonunda DROP ediliyor.
- `packages/shared/src/types/workout.ts`: `EquipmentKey` tipi, `Exercise.equipment?: EquipmentKey[] | null`.
- `packages/shared/src/constants/equipment.ts` (yeni): `EQUIPMENT` (TR etiket, grup, ipucu), `EQUIPMENT_GROUP_LABELS`, `EQUIPMENT_KEYS`, `EQUIPMENT_PRESETS` (full_gym, home_dumbbell, bodyweight). `constants/index.ts` sonuna `export * from './equipment'`.
- `packages/shared/src/utils/equipment.ts` (yeni, ~350 satır, saf): `missingEquipment`, `isExerciseAvailable`, `programEquipmentFit`, `findSubstitute`, `planProgramAdaptation` (keep/replace/drop adımları), `adaptationToPlan` (şablon kopyası için plan, ad sonuna " (ekipmanıma göre)"), `replacementNote`, `ADAPTED_PROGRAM_SUFFIX`, tip `OwnedEquipment`, `AdaptStep`, `ProgramAdaptation`. `utils/index.ts` sonuna export eklendi.
  - İkame puanı: aynı hareket kalıbı 4, akraba kalıp 1, aynı ana kas 2, yüklü hedefe yüklü aday +0.5, ad benzerliği ±0.25. Beceri hareketleri (planche, handstand, pistol, muscle up, front lever, dragon flag, L-sit, one arm) hedef de beceri değilse hiç önerilmez. Ekipmanı NULL aday önerilmez. Aynı gün içinde aletsiz İngilizce ada göre tekrar yok ("Goblet Squat" ile "Dumbbell Goblet Squat" aynı sayılır).
- `packages/shared/src/supabase/workouts.ts`: `updateProgramExercise`, `parseEquipmentPreference`, `getWorkoutEquipment`, `saveWorkoutEquipment` (preferences JSONB okuma-birleştirme-yazma, anahtar `workout_equipment`).
- `packages/shared/src/stores/workoutStore.ts`: state `equipment: EquipmentKey[] | null`, `equipmentLoaded`; aksiyonlar `fetchEquipment`, `saveEquipment` (iyimser, hata olursa geri alır ve fırlatır), `applyProgramAdaptation(supabase, userId, program, adaptation)` (şablonsa `createProgramFromPlan` ile kopya, kendi programıysa satır güncelle/sil, sonra `fetchPrograms`; dönen değer uyarlanmış program).
- `supabase/functions/_shared/ai/equipment.ts` (yeni): TR etiketler, `parseEquipmentPreference`, `equipmentTag`, `equipmentSummary`, `isDoableWith`.
- `supabase/functions/_shared/ai/coach.ts`: `WorkoutCatalogEntry.equipment`, `WorkoutCoachInput.equipment`; katalogda `[barbell+bench]` / `[alet yok]` etiketi (sabit, önbellekli blok, yaklaşık +1000 karakter); kural 9 (yalnızca kayıtlı aletlerle yapılabilen hareketler, farklı durum söylenirse Ekipmanım kartına yönlendir); değişken blokta ekipman satırı.
- `supabase/functions/ai-suggest/index.ts` (`workout_program_chat`): katalog sorgusu `equipment` kolonunu da seçiyor, `user_profiles.preferences.workout_equipment` paralel okunuyor, `resolveName` yalnızca yapılabilir hareketlerde arıyor.

## Kök nedenler / bulgular

- Beslenme: 0 kcal boş öğünler eski v1.0 istemcisinden; "protein tozu" alias'ı içecek satırına gidiyordu; 008'den kalan 32 satırda 100 g değeri porsiyon değeri gibi saklıydı (kullanıcı %33-50 eksik kalori görüyordu); kullanıcı alias'ları yeni doğru satırları gölgeliyordu (47a863 ve dbcb92 kullanıcıları); dolma/sarma 1 porsiyonu tek adet sayılıyordu. Levrek(750gram) ve kuru domates fb8792f ile zaten düzelmişti (2026-09-07 deploy sonrası öğünlerde tekrar etmiyor).
- Ekipman simülasyonu (canlı katalog + canlı 7 şablon, 047 eşlemesi uygulanarak): dambıl+sehpa ile şablonlarda neredeyse tüm satırlar makul karşılık buluyor (Bench Press -> Dumbbell Flat Bench Press, Squat -> Dumbbell Goblet Squat, Dips -> Bankta Dips...). Yalnız vücut ağırlığında çekiş hareketleri (row, pulldown, pull-up, curl) düşüyor, çünkü barfiks barı olmadan katalogda karşılığı yok; bu doğru davranış, yeni ev şablonları bu yüzden eklendi. Seçim yok (null) ya da 047 öncesi veritabanı: hiçbir şey değişmiyor, test edildi.

## Yarım kalan

- Kesinti noktası: mobil arayüz. `apps/mobile/app/(tabs)/workout.tsx` (1316 satır) okunmaya başlandı, hiçbir mobil dosya yazılmadı.
- Tip kontrolü: `packages/shared` için `npx tsc --noEmit -p .` yalnızca eski `src/supabase/events.ts(30,38) TS2584 document` hatasını veriyor (bu işten bağımsız). Edge function'lar scratchpad tsconfig ile kontrol edildi, değişen dosyalarda gerçek hata yok. `pnpm typecheck` ve `pnpm lint` tüm repo için henüz çalıştırılmadı.
- Satır sonu: `packages/shared/src/utils/index.ts` ve `constants/index.ts` CRLF dosyalar, sonlarına LF satır eklendi (karışık). Git `core.autocrlf=true` normalleştirir; istenirse CRLF'e çevir.

## Sonraki adımlar

1. Mobil bileşenler, hepsi `apps/mobile/src/components/workout/` altında yeni dosya (stil örneği `StreakCard.tsx`: `GlassCard`, `useTheme`, `palette/fontSize/fontWeight/spacing` token'ları; `BottomSheet` props: `visible, onClose, title, children, scrollable`). Ekrandaki metinler sabit Türkçe.
   - `EquipmentCard.tsx`: "Ekipmanım" kartı (seçim yoksa "Aletlerini seç, programları ona göre uyarlayalım" çağrısı; varsa özet) + seçim BottomSheet'i: `EQUIPMENT_PRESETS` düğmeleri, `EQUIPMENT_GROUP_LABELS` başlıklarıyla gruplu tek tek açma/kapama, Kaydet -> `saveEquipment`.
   - `EquipmentFitBadge.tsx`: `programEquipmentFit(program, equipment)`; equipment null ise hiç çizme; tam uyumsa "Ekipmanına uygun", değilse "N hareket için alet yok".
   - `AdaptProgramButton.tsx`: program detayında, uyum tam değilse görünür; `planProgramAdaptation(liveProgram, exercises, equipment)` önizlemesi (değişen/düşen listesi, düşenlerde eksik alet etiketi), onayla -> `applyProgramAdaptation`, dönen programı `setSelectedProgram` ile aç. Şablonsa "kopyası oluşturulacak" yaz.
2. `workout.tsx` bağlantıları (yalnızca birkaç satır; dosya zaten 1316 satır):
   - Satır 86 civarı store destructure'a `equipment, fetchEquipment, saveEquipment, applyProgramAdaptation` ekle; `load` içinde `fetchEquipment(supabase, uid)`.
   - Satır 65-70 `COACH_SUGGESTIONS` listesine "Ekipmanıma göre program yaz".
   - Kütüphane (yaklaşık 775-826) ve hareket seçici (939-967) için tek `useState` ile "Ekipmanıma uygun" çipi; `filteredExercises` (yaklaşık 552) ve seçici filtresine `isExerciseAvailable(e, equipment)`.
   - Programlar sekmesi (828-855): üstte `EquipmentCard`; `ProgramCard` (1219-1272) içine `EquipmentFitBadge`; uyumlu programlar üste sıralanabilir.
   - Program detay sheet'i (932'den itibaren, gün listesi 1040): `AdaptProgramButton`. iOS iç içe modal açmıyor, önizleme aynı sheet içinde gösterilmeli.
3. Doğrula:
   ```bash
   pnpm typecheck
   ```
   ```bash
   pnpm lint
   ```
4. Uyarlama algoritmasını tekrar denemek için scratchpad betikleri (proje dışında): `dumpprog.mjs` (canlı katalog + programlar, salt okuma), `simeq.mts` (`node --no-warnings --experimental-strip-types simeq.mts home_dumbbell|bodyweight|dumbbell_pullup`), `plancheck.mts`, `coachcheck.mts`. Prod okuma yardımcısı `db.mjs`:
   ```js
   import { createRequire } from 'node:module'
   import { readFileSync } from 'node:fs'
   const root = 'C:/Users/Lenovo/Desktop/uygulamalar/LIFEOS'
   const require = createRequire(root + '/packages/shared/package.json')
   const { createClient } = require('@supabase/supabase-js')
   const env = Object.fromEntries(readFileSync(root + '/.env', 'utf8').split('\n')
     .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean)
     .map(m => [m[1], m[2].replace(/^["']|["']$/g, '').trim()]))
   export const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
   ```
5. Yayın, **kullanıcı onayıyla**, bu sırayla (function yeni kolonu seçtiği için migration önce):
   ```bash
   supabase db push
   ```
   ```bash
   supabase functions deploy parse-meal
   ```
   ```bash
   supabase functions deploy ai-suggest
   ```
   ```bash
   pnpm db:embed
   ```
   ```bash
   pnpm -s eval:nutrition
   ```
   ```bash
   pnpm db:types
   ```
   (`db:types` üretilen `packages/shared/src/types/database.ts` dosyasına `equipment` ve `portion_count` kolonlarını ekler; elle düzenlenmedi.)
6. Kullanıcıya sorulacak: eski yanlış değerlerle kaydedilmiş öğünler ve 12 adet 0 kcal öğün yeniden hesaplansın mı (prod veri değişikliği).
7. Memory güncelle: `edge-function-typecheck-gap.md` artık eski. Deno 2.9.6 kurulu ama `pnpm typecheck:functions` (`deno check`) npm paketlerini bulamıyor ve kök `package.json` dosyasına `workspaces` ekleyerek onu değiştiriyor; bu olursa `git checkout -- package.json`. Scratchpad tsc yolu geçerli.
8. Commit yalnızca kullanıcı isterse; Co-Authored-By yok, tire yok. Web'deki regex ekipman filtresi (`apps/web/components/workout/WorkoutView.tsx` 26-34) bilerek değiştirilmedi.
9. Son temizlik: proje içinde yeni dosya olarak yalnızca 046, 047, `constants/equipment.ts`, `utils/equipment.ts`, `_shared/ai/equipment.ts`, bu devir teslim dosyası ve yazılacak mobil bileşenler olmalı.

## Denenip işe yaramayanlar

- `pnpm typecheck:functions` (deno check): npm paketi bulunamıyor ve kök `package.json` değişiyor. Kullanma, scratchpad tsconfig ile tsc kullan (Deno importları TS2307/TS2304/TS7006 gürültüsü üretir, bunları süz).
- `git status --ignored`: çok büyük çıktı, kullanma.
- Node heredoc içinde JS template literal ile `\b` yazmak dosyaya backspace karakteri koydu; regex içeren düzenlemeleri Edit aracıyla yap.
- `packages/shared` altındaki dosyalar CRLF: düz metin `includes` ile değiştirme betikleri eşleşmiyor, Edit aracını kullan.
- İlk ikame puanlamasında eşitlik alfabetik bozuluyordu (Bench Press -> Decline, Squat -> Bulgarian Split Squat, vücut ağırlığında Planche); ad benzerliği, varyant cezası ve beceri hareketi dışlaması bununla eklendi.
