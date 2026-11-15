# Esnek plan tasarımı (Faz 6, Planlama)

Tarih: 2026-11-15. Kaynak: sahibin kendi haftalık iskeletini (15 rutin) kurarken not ettiği dört madde (`docs/KALAN_ADIMLAR.md`, Faz 6 Planlama): kötü gün modu, rutinde güne göre saat, alışkanlığı bloğa bağlama, saat yerine gün bölümü.
Bu belge kod içermez. Her bölüm ayrı bir `feature/*` dalı ve ayrı migration olarak yapılır; migration push sahibin onayıyla.

## 1. Ortak sorun ve ilkeler

Dört maddenin kökü aynı: plan katı. Her gün aynı saat, aynı süre, ya hep ya hiç. Bir gün kayınca kullanıcı bütün planı bırakıyor.

1. Esneklik rutinin içinde kalır. Rutini ikiye bölmek çözüm değil: `target_count` sayacı (örnek: 42 günlük bootcamp) ve hedef bağı (`goal_id`) bölünür.
2. Hiçbir şey silinmez. Kapatılan blok geri açılabilir; günün kaydı kaybolmaz.
3. AI'a ve Pro'ya bağlı değil (Pro sadece AI kuralı). Hepsi kullanıcının kendi dokunuşuyla çalışır.
4. Varsayılan davranış değişmez: bu alanları kullanmayan rutin bugünkü gibi çalışır. Yeni alanların hepsi boş olabilir.
5. Saat hesabı kullanıcının `timezone`'una göre (kök CLAUDE.md); sunucu UTC'de çalışır.

## 2. Bugünkü durum (şemadan)

- `routines`: tek `start_time`/`end_time` (077'den beri gece yarısını geçebilir), `estimated_minutes`, `days_of_week`, `kind` (`block`, `task`, `habit`), `is_protected`, `min_minutes`, `target_count`, `start_count`, `times_per_week`, `times_per_day`, `goal_id`, `workout_program_id` (079).
- `routine_exceptions(routine_id, occurrence_date)`: yalnız atlama.
- `materialize_routines()` (068): bloğu rutinin saatiyle `time_blocks`'a, görevi `tasks`'a yazar; `(routine_id, occurrence_date)` tekil, `ON CONFLICT DO NOTHING`.
- `routine_done_count()` (065): tamamlanan görev + tamamlanan blok (`completed_at`) + günlük hedefi tutan `routine_completions` satırı.
- Blok rutininde saat zorunlu: `routines_block_has_time` kısıtı ve `RoutineSheet.tsx` (`plan_err_time_required`).
- Seri: gün serisi yok. Alışkanlık (`habitWeekStreak`) ve antrenman (`computeWorkoutStreak`) haftalık sayılır.
- `daily_plans`: `energy_level`, `ritual_completed_at`, `notes`; gün düzeyinde mod alanı yok.
- `event-notifications`: `completed_at` boş ve `notification_sent_at` boş blokları hatırlatır.

## 3. Güne göre saat ve süre (madde 205)

Örnek: bootcamp hafta içi 14:30 ile 16:30, hafta sonu 60 dk.

Şema: yeni tablo `routine_day_overrides`.

| Sütun | Tip | Not |
|-------|-----|-----|
| `routine_id` | UUID FK `routines` ON DELETE CASCADE | |
| `day_of_week` | SMALLINT 0..6 | `days_of_week` ile aynı kodlama |
| `start_time`, `end_time` | TIME, ikisi birlikte boş ya da dolu | gece yarısını geçebilir (077 kuralı) |
| `minutes` | SMALLINT 1..1440, boş olabilir | yalnız süre farklıysa |

Birincil anahtar `(routine_id, day_of_week)`. RLS: rutinin sahibi okur ve yazar (`EXISTS` ile `routines.user_id = auth.uid()`). Kısıt: gün, rutinin `days_of_week` listesinde olmalı (tetikleyici ya da istemci doğrulaması; kısıt alt sorgu alamaz).

Üretim: `materialize_routines` blok ve görev için `COALESCE(o.start_time, r.start_time)`, `COALESCE(o.end_time, r.end_time)`, görevde `COALESCE(o.minutes, r.estimated_minutes)` kullanır; `o` = o günün haftanın günüyle eşleşen satır. Yalnız `minutes` dolu ve saat boşsa blokta bitiş = başlangıç + `minutes`.

Var olan bloklar: üretim `DO NOTHING` olduğu için override eklemek yarının ve sonrasının bloklarını değiştirmez. Rutin düzenlemesindeki "bundan sonrası" yolu (bugün saat değişikliğinde kullanılan) override değişikliğinde de çağrılır; `routine_modified = true` bloklara dokunulmaz.

Arayüz: `RoutineSheet` saat alanının altında "Günlere göre farklı" anahtarı. Açılınca seçili günler satır satır listelenir, her satırda saat ya da süre. Kapalıyken bugünkü form değişmez.

Sayaç: değişmez. Tek rutin, tek `target_count`.

## 4. Saat yerine gün bölümü (madde 208)

Sorun: katı saatli plana uyulmuyor; gün içinde toplantı çıkınca bütün saatler kayıyor.

Şema:
- `routines.day_part TEXT` (`morning`, `noon`, `afternoon`, `evening`), boş olabilir.
- `routines_block_has_time` kısıtı gevşer: `kind <> 'block' OR start_time IS NOT NULL OR day_part IS NOT NULL`. `routines_time_pair` aynen kalır.
- `time_blocks.day_part TEXT`, aynı değerler, boş olabilir. Doluysa blok "yüzer": saati yer tutucudur.

Üretim: `day_part` dolu ve saat boşsa blok, gün bölümünün varsayılan başlangıcına yerleşir; bitiş = başlangıç + `estimated_minutes` (boşsa 30). Varsayılan başlangıçlar: sabah 08:00, öğle 12:00, öğleden sonra 15:00, akşam 19:00. `time_blocks.start_time NOT NULL` kalır; zaman çizelgesi, kapasite hesabı ve AI planlayıcı bugünkü gibi çalışır.

Gösterim: yüzen blok zaman çizelgesinde saatle değil gün bölümü başlığı altında listelenir ("Sabah"), saat yazmaz. Kullanıcı sürükleyip bir saate koyarsa o günün bloğu sabitlenir (`day_part = NULL`, `routine_modified = true`); rutin değişmez.

Bildirim: `event-notifications` yüzen bloğu saatinde hatırlatmaz (yanlış saatte hatırlatma güveni kırar). Gün bölümü hatırlatması gerekirse `daily-digest`'in sabah/öğlen/akşam slotlarına satır olarak eklenir; bu belge kapsamında değil.

Arayüz: `RoutineSheet` blok türünde saat alanının yanında "Saat yok, gün bölümü seç" seçeneği; dört düğme (44dp). `plan_err_time_required` mesajı "Saat ya da gün bölümü seç" olur.

Çakışma: §3 ile birlikte kullanılabilir; override saati doluysa o gün saat geçerlidir, gün bölümü yok sayılır.

## 5. Alışkanlığı bloğa bağlama (madde 207)

Örnek: "Hareket / spor" alışkanlığı ile spor bloğu aynı işi sayıyor ama birbirinden habersiz; aynı iş iki kez işaretleniyor.

Şema: `routines.habit_routine_id UUID REFERENCES routines(id) ON DELETE SET NULL`, yalnız `kind = 'block'` satırında dolu olabilir. Bağlanan rutin `kind = 'habit'` olmalı ve aynı kullanıcıya ait olmalı (tetikleyici doğrular). Bir alışkanlığa birden çok blok bağlanabilir (spor bloğu hafta içi, yürüyüş bloğu hafta sonu).

Davranış (sunucu, tetikleyici): `time_blocks.completed_at` boştan doluya geçince ve bloğun rutininde `habit_routine_id` doluysa, alışkanlığın o günkü `routine_completions` satırı yazılır:
- Satır yoksa `count = 1` ile eklenir.
- Satır varsa ve aynı blok daha önce saymadıysa `count` bir artar, `times_per_day` ile sınırlanır. Bir blok bir günde en çok bir kez sayar.
- Tamamlama geri alınınca (`completed_at` doludan boşa) yalnız bu bloğun eklediği bir birim geri alınır; kullanıcının elle işaretlediği kalır.

Hangi birimin bloktan geldiğini bilmek için `routine_completions.source_block_ids UUID[]` (boş dizi varsayılan). Tekil sayım ve geri alma bu diziden yapılır.

Çift sayım: `routine_done_count` alışkanlığı `routine_completions`'tan, bloğu `time_blocks`'tan sayar; ikisi ayrı rutin olduğu için çift sayım yok. Alışkanlık haftalık hedefi (`times_per_week`) gün sayar; aynı gün hem elle hem bloktan işaretlemek tek gün sayılır (bugünkü `habitDoneDays` kuralı).

Arayüz: blok rutini formunda "Alışkanlığa bağla" seçici (yalnız kullanıcının alışkanlıkları listelenir, boş seçenek varsayılan). `HabitsCard` bağlı alışkanlıkta küçük bağ ikonu ve "Spor bloğu tamamlanınca işaretlenir" ipucu gösterir.

## 6. Kötü gün modu (madde 204)

Sorun: her gün aynı ve dolu plan "hep ya hiç" davranışını tetikliyor; bir gün kaçınca bütün plan bırakılıyor.

Davranış: Bugün ekranında tek dokunuş "Bugün asgari gün". O gün için:
- Korunan rutinlerin (`is_protected`) blokları kalır; süre `min_minutes` doluysa ona kısalır, boşsa olduğu gibi kalır.
- Korunmayan rutinlerin blokları ve görevleri o gün için kapanır: görünmez, hatırlatılmaz, başarısız sayılmaz. Silinmez.
- Rutinden gelmeyen (elle eklenen) blok ve görevlere dokunulmaz.
- Aynı düğme "Normal güne dön" olur; her şey geri gelir.

Şema:
- `daily_plans.minimum_mode BOOLEAN NOT NULL DEFAULT FALSE`.
- Kapanma veri silmez ve satır güncellemez; filtre olarak uygulanır. Böylece geri dönüş tek alanı çevirmektir ve `routine_modified` bloklar etkilenmez.
- Kısaltılmış süre gösterimdir: blok satırının `end_time`'ı değişmez, ekran `start + min_minutes` gösterir. Tamamlama sayımı (`routine_done_count`) değişmez.

Sunucu tarafı:
- `event-notifications`: o günün `daily_plans.minimum_mode` doluysa korunmayan rutin bloğunu hatırlatmaz.
- `daily-digest`: asgari günde sabah ve akşam metni bunu bilir ("Bugün sadece korunanlar"); metin `copy.ts` havuzlarına eklenir.
- `roll_over_tasks`: asgari gündeki korunmayan rutin görevi devretmez ve `carry_count` artmaz.
- Günün raporu (`daily_reports.facts`): asgari günde payda yalnız korunan rutinlerdir; hepsi tamamsa gün başarılıdır.

Seri: gün serisi yok; alışkanlık ve antrenman serileri haftalık. Asgari gün bunları bozmaz, çünkü haftalık hedef tek günle düşmez. Ek bir seri kuralı gerekmez.

Korunan rutin yoksa: düğme yine çalışır, plan boşalır; ekran "Korunan rutin yok. Rutinlerde 'Korunan' işaretleyebilirsin" der ve Planlama > Rutinler'e götürür.

AI ile ilişki: AI planlayıcının blokları asgariye kısaltması (`_shared/ai/planner.ts`) ayrı yol olarak kalır. Asgari gün AI çağırmaz.

## 7. Sıra ve dallar

| Sıra | Dal | Migration | Neden bu sırada |
|------|-----|-----------|-----------------|
| 1 | `feature/kotu-gun` | `daily_plans.minimum_mode` | En yüksek etki, şema küçük, mevcut alanları (`is_protected`, `min_minutes`) kullanır |
| 2 | `feature/rutin-gun-saati` | `routine_day_overrides`, `materialize_routines` | Sahibin iskeletinde doğrudan engel |
| 3 | `feature/aliskanlik-blok` | `habit_routine_id`, `source_block_ids`, tetikleyici | Tetikleyici testi yerel PostgreSQL ile |
| 4 | `feature/gun-bolumu` | `day_part` iki tabloda, kısıt gevşemesi | Gösterim ve bildirim değişikliği en geniş olanı |

Her dal: migration yerel PostgreSQL 18'de iki kez uygulanır (idempotent), `pnpm test` ve `pnpm typecheck`, emülatörde ilgili ekran. `pnpm db:types` push'tan sonra sahipte.

## 8. Ölçüm

- Asgari gün: haftada kaç kullanıcı bastı; bastığı günün ertesi günü planına dönen oran (dönüş oranı, modun amacı). Mevcut tablolardan okunur (`daily_plans.minimum_mode`, `time_blocks.completed_at`), yeni olay adı gerekmez.
- Gün bölümü ve güne göre saat: kullanan rutin sayısı (`routines.day_part`, `routine_day_overrides`).
- Alışkanlık bağı: bloktan gelen işaretleme oranı (`source_block_ids` dolu satırlar).

## 9. Kapsam dışı

- Gün bölümü için ayrı bildirim slotu (§4).
- Asgari günü AI'ın önermesi (Pro, ayrı iş).
- Web arayüzü: önce mobil; web bugünkü gibi gösterir, yeni alanları bozmadan yok sayar.

## 10. Açık sorular (sahip)

1. Gün bölümü varsayılan saatleri (08:00, 12:00, 15:00, 19:00) uygun mu, yoksa kullanıcı ayarı mı olmalı?
2. Asgari gün düğmesi yalnız Bugün'de mi, yoksa Planlama'daki gün görünümünde de mi?
3. Asgari günde korunmayan blok tamamen gizli mi, yoksa soluk ve katlanmış mı görünsün?
