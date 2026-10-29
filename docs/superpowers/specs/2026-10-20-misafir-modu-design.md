# Misafir modu (mobil) tasarımı

Tarih: 2026-10-20 (rev. 2, Codex incelemesi sonrası; rev. 3, 2026-10-28: açık sorular sahibin kararıyla kapandı, bölüm 18; rev. 4, 2026-10-29: persona kağıt testi sonrası sahibin kararları, bölüm 18.2). Kapsam: `apps/mobile`, `supabase/` (migration, iki edge function), `apps/web/lib/api` ve üç web API rotası (sunucu kapıları, bölüm 9), web kayıt formlarında onay bekleme durumu (bölüm 6.6), gizlilik politikasına misafir paragrafı (bölüm 11), `packages/shared` içinde küçük bir olay adı eklemesi. Web anonim girişi açmıyor.

Bu belge kod değil, tasarımdır. Satır numaraları `origin/develop` üzerinde okunan koda göre verilmiştir.

## 1. Amaç ve başarı ölçütleri

Sorun: uygulama ilk açılışta giriş/kayıt zorluyor (`apps/mobile/app/_layout.tsx:97-100`, oturum yoksa `/(auth)/login`). Kullanıcı değeri görmeden hesap açmak zorunda, ilk gün düşüşü buradan geliyor. Deneyimli bir geliştirici arkadaşın geri bildirimi de bu yönde.

Hedef: kullanıcı hesap açmadan görev, planlama, beslenme kaydı ve antrenmanı kullanır. Hesap yalnızca gerçekten gerektiği anda istenir.

Başarı ölçütleri:
1. Yeni kurulum, hiçbir giriş ekranı görmeden ilk görevi ekleyebiliyor (emülatörde elle doğrulanır).
2. Misafir hesap açınca veri kaybı sıfır: aynı `uid`, tüm satırlar yerinde.
3. Misafir hiçbir koşulda RevenueCat'e `logIn` olmaz, AI edge function'larında model çağrısı ve entegrasyon rotalarında bağlantı yapamaz (hepsi sunucuda zorlanır, bölüm 9).
4. Ölçüm: yeni kurulumdan ilk görev eklemeye oran (mevcut `analytics.user_funnel` ile). Misafirden hesaba dönüşüm oranı = `account_upgraded` / `guest_started`, kohort haftasına göre. İki olay da istemciden değil veritabanı tetikleyicisinden yazılır, kullanıcı silinse (yükseltme sonrası hesap silme, temizlik cron'u) de satırları kalır (bölüm 11). Hedef sayı bu belgede verilmiyor, ilk iki haftanın verisi çıkınca konur.

## 2. Onaylanmış kararlar (yeniden açılmıyor)

- Mekanizma: `supabase.auth.signInAnonymously()`. Misafir gerçek bir `auth.users` satırı, `auth.uid() = user_id` RLS'i ve tüm tablolar değişmez. Veri taşıma yok.
- Yükseltme: kayıt ekranı `signUp` yerine misafir kullanıcıda `updateUser` ile e-posta ve şifreyi bağlar, `uid` korunur. Ayrıntı (iki adım, devam ettirilebilir) bölüm 6.4 ve 6.5.
- Mobilde tek kayıt yolu budur: oturumu olmayan kullanıcı da kayıt ekranında önce misafir olur (`signInAnonymously`), sonra aynı yükseltmeden geçer. Mobilde `signUp` kalkar (2026-10-28).
- "Confirm email" üretimde AÇILIR. Hesabın `ready` olması, AI ve entegrasyonlar onaylı e-posta ister; onay gelene kadar kullanıcı misafir aşamasındadır ve ücretsiz özellikleri kullanır (2026-10-28).
- Misafir MEVCUT bir hesaba giriş yaparsa misafir verisi geride kalır (seçenek a). Misafirin verisi varsa önceden, sayısıyla net uyarı gösterilir; verisi yoksa doğrudan giriş yapılır (bölüm 7, 2026-10-29). Birleştirme fonksiyonu yok.
- Hesap gerektiren anlar: satın alma/paywall, AI özellikleri, entegrasyonlar (Google Takvim, Todoist, Apple Hatırlatıcılar içe aktarma). Ayrıca yalnızca Profil'de yedekleme hatırlatma kartı (bölüm 6.3; Bugün'de banner yok, 2026-10-29).
- Bu kapılar yalnızca istemcide değil SUNUCUDA da zorlanır: AI edge function'ları, Google Takvim ve Todoist rotaları kalıcı ve e-postası onaylı hesap ister (bölüm 9). İstemci kapısı kullanıcı deneyimi, sunucu kapısı güvenlik sınırıdır. Apple Hatırlatıcılar içe aktarmasının sunucu rotası yok, kapısı yalnızca istemcidedir.
- Görev, planlama, beslenme kaydı, antrenman hesapsız çalışır.
- Temizlik: 30+ gün etkin olmayan anonim kullanıcıları haftalık cron siler.
- Dashboard'da "Allow anonymous sign-ins" açılır (sahibi yapar), ama yalnızca sunucu kapıları canlıya çıktıktan sonra (bölüm 16).

## 3. Koddan çıkan bulgular (tasarımı şekillendiren)

1. Tüm AI düğmeleri tek yerden geçiyor: `useProGate().requirePro` (`apps/mobile/src/hooks/useProGate.ts:11`). Çağrı yerleri (8 adet): `app/task/[id].tsx:111`, `app/(tabs)/planning.tsx:107`, `app/(tabs)/workout.tsx:198`, `app/(tabs)/nutrition.tsx:578` ve `:663`, `src/hooks/useWorkoutCoach.ts:81`, `src/components/tasks/BrainDumpSheet.tsx:126`, `src/components/report/useDayReport.ts:20`. Tek kapı olduğu için mobil tarafı küçük kalır.
2. Ücretsiz kullanıcıya ömür boyu 3 AI plan hakkı veriliyor (`supabase/functions/_shared/ai/usage.ts:128`, `ai_allowance`). Anonim giriş serbest olunca her yeni misafir 3 hak daha demek: sunucu kapısı olmadan maliyet sızıntısı. Bu yüzden sunucu kapısı zorunlu ve misafir bu ücretsiz haklardan da yararlanmaz (bkz. bölüm 9).
3. `daily-report` edge function'ı model çağırmıyor (içinde Anthropic/`resolveAiAccess` yok), misafire açık kalır. AI'lı anlatı kısmı `ai-suggest` `daily_report` rotasından geliyor (`packages/shared/src/supabase/reports.ts:61`) ve kapıdan geçer.
4. `parse-meal` free katmanda kural katmanıyla çalışıyor ve "öğün kaydı hiçbir koşulda durmaz" ilkesini taşıyor (`supabase/functions/parse-meal/index.ts:135-141`). Misafire 403 verilmez, model katmanı kapalı kalır.
5. `events` tablosunda `events_name_check` kısıtı var, yeni olay adı migration ister (`supabase/migrations/040_events.sql:43`). `events.user_id` `ON DELETE CASCADE` (`040:32`) ve istemci kendi satırını yazabiliyor (`040:57-58`): bu iki özellik ölçüm tasarımını etkiler (bölüm 11). Aynı dosyada `analytics.user_funnel` "register" adımını `user_profiles.created_at` olarak tanımlıyor (`040:12`). Misafirler de `user_profiles` satırı alacağı için kayıt sayısını şişirir, huni bozulur.
6. `handle_new_user` trigger'ı (`014_fix_signup_triggers.sql:9-24`) anonim kullanıcı yaratılınca da çalışır ve `display_name` boş, `timezone` `raw_user_meta_data`'dan ya da `Europe/Istanbul` ile `user_profiles` satırı açar. Yükseltmede trigger tekrar çalışmaz, isim ayrıca yazılmalı. Bkz. bölüm 6.4.
7. `_layout.tsx` oturum değişimlerinde yerel durumu yalnızca `SIGNED_OUT` olayında sıfırlıyor (`:69-77`). Misafirden mevcut hesaba `signInWithPassword` ile geçişte `SIGNED_OUT` gelmez, `SIGNED_IN` gelir. Sıfırlama bu durumda da çalışmalı. Bkz. bölüm 7.
8. `_layout.tsx:55` her oturumda `initRevenueCat(s.user.id)` çağırıyor. `SubscriptionContext` `isPro`'yu "Supabase satırı VEYA RevenueCat hakkı" olarak hesaplıyor (`:179`) ve RevenueCat'ten okuyor (`purchases.ts:44`). `purchases.ts` `logIn`'i serileştirmiyor ve çıkışta `Purchases.logOut` çağırmıyor; kullanıcı değişimi sırasında eski kullanıcının hakkı yeni kullanıcıda görünebilir ve gecikmiş yanıtlar yanlış kullanıcıya yazılabilir. Bkz. bölüm 8.
9. `registerForPushNotificationsAsync` her oturumda hemen çağrılıyor ve izin penceresini açıyor (`_layout.tsx:54`, `notifications/setup.ts:100-103`). Misafirde bu, değer görmeden izin isteği demek. Bkz. bölüm 10.
10. `supabase/config.toml` `[auth]` altında anonim giriş ve manuel bağlama ayarı yok (`:15-25`). `@supabase/supabase-js` `^2.47.2`, `User.is_anonymous` tipi mevcut.
11. Supabase dokümanı: anonim kullanıcı `authenticated` rolünü kullanır, JWT'de `is_anonymous` claim'i var; e-posta ile kalıcıya çevirmek için "manual linking" açık olmalı, e-posta doğrulanır, sonra şifre `updateUser` ile verilir; anonim giriş için IP başına varsayılan 30 istek/saat sınırı var; otomatik temizlik yok. Kaynak: https://supabase.com/docs/guides/auth/auth-anonymous
12. Google Takvim ve Todoist işleri edge function değil, `apps/web` altındaki Next.js API rotaları: `app/api/integrations/google/{start,callback,complete,disconnect}`, `app/api/import/todoist`. Hepsi `authenticateRequest` (`apps/web/lib/api/auth.ts:8-18`) ile oturum doğrular; mobil Bearer jetonuyla çağırır. Bu fonksiyon `is_anonymous` döndürmüyor, yani bugün bir misafir JWT'si bu rotalara geçer. `complete` kendi kapısını `completeHandoff` (`lib/integrations/handoff.ts:57`) içinde yapıyor. `integrations` tablosunda INSERT politikası yok (`056_integrations.sql:40-44`: yalnızca SELECT ve DELETE), yani bağlantı satırları yalnızca bu rotalar üzerinden (admin istemci) yazılabilir: rotaları kapatmak yeterli.
13. Diğer edge function'lar (`calendar-sync`, `send-email`, `daily-digest`, `event-notifications`) kullanıcı JWT'siyle çağrılmıyor: service role / cron ile çalışıyorlar (`calendar-sync/index.ts:4` "yalnızca service_role"). `revenuecat-webhook` kendi secret'ıyla doğruluyor. Kullanıcı JWT'siyle erişilebilen tek edge function'lar `ai-suggest`, `parse-meal`, `daily-report`, `delete-account`.
14. `070_` numaralı migration zaten var (`070_drop_integrations_sync.sql`). `071_` (RevenueCat `is_sandbox`) ve `072_` (AI model yönlendirme, `events_name_check` içine `ai_fallback_notified` ekliyor) başka dallarda ayrıldı. Bu işin migration'ı `073_`; `events_name_check` yeniden tanımlanırken `ai_fallback_notified` korunmalı. (`074_` güvenlik migration'ı için ayrıldı.)
15. Canlı Auth durumu (2026-10-28 sorgusu): "Confirm email" KAPALI. 52 e-posta hesabının hepsi onaylı ve şifreli; onay e-postası neredeyse hiç gitmemiş (`confirmation_sent_at` yalnızca 1 satırda dolu). Google ile açılmış 6 hesap var ve bunların 5'inde şifre YOK (`encrypted_password` boş). Mobilde Google girişi yok (`signInWithOAuth` yalnızca web `LoginForm.tsx`).
16. Confirm email açılınca `signUp` oturum döndürmez. Web'in iki kayıt formu (`RegisterForm.tsx:23`, `LoginForm.tsx:103`) `data.user` varsa doğrudan `/dashboard`'a gidiyor ve onay bekleme durumu göstermiyor; eski mobil `register.tsx:30-31` de yalnızca `!data.user` durumunda bilgi veriyor, yani oturumsuz başarılı kayıtta ekranda hiçbir şey olmuyor.
17. Supabase'in yerleşik e-posta servisi yalnızca organizasyonun ekip adreslerine ve saatte birkaç e-posta gönderir. Kod akışı (6.5) ve Confirm email özel SMTP olmadan çalışmaz. Özel SMTP'nin kurulu olup olmadığı veriden kesin değil (2026-10-22'de sahip dışı bir adrese sıfırlama e-postası gitmiş görünüyor, ama adres ekip üyesi olabilir); Dashboard'dan bakılır (bölüm 16). Edge function secret'ı `RESEND_API_KEY` tanımlı değil, ama Auth SMTP ayarı ondan bağımsızdır.

## 4. Yeni ilk açılış akışı

```
Uygulama açılır
  INITIAL_SESSION var ->  hasSeenOnboarding?  evet: /(tabs)/today   hayır: /onboarding   (mevcut davranış)
                          (hesap aşaması bekleyen e-posta ya da şifre belirleme ise bölüm 5 ve 6.5)
  INITIAL_SESSION yok ->
      "bu kurulumda daha önce oturum oldu mu?" (AsyncStorage: lifeos_had_session)
        hayır (gerçek ilk açılış): bootstrapGuest() -> signInAnonymously
              başarı: onAuthStateChange SIGNED_IN -> yukarıdaki satıra düşer (/onboarding)
              hata (ağ yok, anonim giriş kapalı, 429): /(auth)/login (misafir düğmesi yeniden dener)
        evet (çıkış yapılmış): /(auth)/login
```

Kurallar:
- `lifeos_had_session` her gerçek oturum görüldüğünde `'1'` yazılır (`_layout.tsx` içindeki `onAuthStateChange`). Anahtar kullanıcıya bağlı değil, kuruluma bağlı.
- Çıkış yapan biri (kalıcı ya da misafir) sessizce yeni misafire çevrilmez, login ekranına gider. Login ekranına "Misafir olarak devam et" düğmesi eklenir (aynı `bootstrapGuest`).
- `bootstrapGuest` bir `useRef` ile tek sefer çalışır (çift tetiklenme yeni boş misafir yaratmasın). `signInAnonymously({ options: { data: { timezone } } })` ile saat dilimi kayıt anında yazılır (`handle_new_user` bunu okur).
- Onboarding (`app/onboarding.tsx`) misafirle aynen çalışır, `finish()` içindeki `getUser()` misafir `uid` ile döner (`:48-49`). İki değişiklik:
  - Onboarding bitişindeki zorunlu paywall (`:54-56`) misafirde atlanır. Değer görmemiş misafire ödeme duvarı çıkarmak hedefle çelişir. Deneme teklifi hesap açıldıktan sonra gösterilir (bkz. bölüm 8, madde 7).
  - İlk slayta küçük bir "Zaten hesabım var" bağlantısı (login ekranına). Yeniden kurulumda geri dönen kullanıcı için tek çıkış yolu bu. Bağlantı bölüm 7'deki kuralla çalışır: misafirin verisi varsa uyarı çıkar, yoksa (temiz kurulum) doğrudan giriş yapılır.
- Bildirim izni: misafirde `registerForPushNotificationsAsync` uygulama başlarken izin PENCERESİ açmaz. Mevcut izin zaten verilmişse token sessizce kaydedilir; verilmemişse izin istemi bağlamda yapılır: kullanıcı ilk zaman bloğunu kaydettiğinde ya da bildirim ayarını açtığında. Onboarding `finish()` izin istemez (2026-10-29 kararı: "Atla" da `finish()`'e düştüğü için persona testinde sistem penceresi kullanıcı uygulamayı görmeden çıktı ve reddedildi). Fonksiyona `{ prompt: boolean }` seçeneği eklenir (bkz. bölüm 10).

## 5. Oturum ve hesap aşaması modeli

Mevcut durum: `_layout.tsx` kendi `session` state'ini tutuyor, `SubscriptionContext` ayrı bir `onAuthStateChange` dinleyicisiyle `userId` tutuyor, ekranlar tek tek `supabase.auth.getUser()` çağırıyor. `is_anonymous` için üçüncü bir kopya açılmaz.

Yeni: `apps/mobile/src/contexts/AuthContext.tsx`, `SubscriptionProvider`'ın üstünde (`_layout.tsx:132-140`).

```ts
type AccountStage =
  | 'guest'          // is_anonymous, bekleyen e-posta yok
  | 'pending_email'  // is_anonymous ve Auth'ta new_email var (kod bekleniyor)
  | 'needs_password' // kalıcı, OAuth kimliği yok ve user_metadata.password_set !== true
  | 'ready'          // kalıcı, e-postası onaylı ve (password_set === true ya da OAuth kimliği var)

interface AuthState {
  session: Session | null
  userId: string | null
  stage: AccountStage | null     // oturum yoksa null
  isAnonymous: boolean           // stage guest veya pending_email
  isReady: boolean               // INITIAL_SESSION geldi ve stage çözüldü
}
export function useAuth(): AuthState
```

- Kaynak Auth'un kendisidir, yerel depo değil. `is_anonymous` oturumla birlikte gelir. `new_email` JWT'de yok: anonim oturum açılışında ve `AppState` `active` olduğunda bir kez `supabase.auth.getUser()` (sunucuya gider) çağrılır; `user.new_email` doluysa `pending_email`. Ağ yoksa son bilinen aşama (`AsyncStorage`, yalnızca ipucu) kullanılır, ağ gelince Auth'a göre düzeltilir.
- `password_set` Auth'un `user_metadata` alanında tutulur (cihazlar arası ve yeniden kurulumdan sağ çıkar). `undefined` ve `false` aynı: `needs_password`. `user_metadata` istemci tarafından yazılabilir, yani bu bir GÜVENLİK sınırı değil, kullanıcıyı şifre belirlemeye yönlendiren bir UX bayrağıdır. Sunucu kapıları (bölüm 9) yalnızca `is_anonymous`'a bakar.
- Eski kalıcı kullanıcılar `password_set` taşımaz. Bu yüzden migration, yükseltme tek çağrıyla yapılmadan ÖNCE mevcut kalıcı kullanıcılara bayrağı yazar (bölüm 12'deki geriye dönük doldurma). Mobilde `signUp` kalktığı için bayrağı bundan sonra yalnızca iki yer yazar: yükseltmenin şifre adımı (6.5) ve web'in iki kayıt formu (`signUp` `options.data.password_set = true`, bölüm 6.6). Mobil sürümde ek önlem: kalıcı kullanıcıda bayrak yoksa önce bir kez `refreshSession()` çağrılır (eski JWT'deki metadata bayat olabilir), hâlâ yoksa `needs_password`.
- OAuth kullanıcıları: `user.identities` içinde `email` dışında bir sağlayıcı (bugün yalnızca web'den `google`) varsa şifre şartı aranmaz, kullanıcı `ready` sayılır. Sebep: canlıda şifresiz 5 Google hesabı var (bulgu 15); bunlar bir gün mobilde açılırsa yanlışlıkla şifre adımına düşmemeli.
- Onaylı e-posta: `ready` için `user.email_confirmed_at` dolu olmalı (2026-10-28 kararı). Confirm email açıkken anonim kullanıcı ancak kodu doğrulayınca kalıcı olur, yani bu koşul yükseltme yolunda kendiliğinden sağlanır; mevcut 58 kalıcı hesabın hepsinde dolu. Kontrol yine de türetimde ve sunucuda yazılır (bölüm 9), ayar ileride kapanırsa doğrulanmamış hesap `ready` olmasın diye. Kalıcı ama onaysız kullanıcı (yalnızca web `signUp` sonrası onay bekleyen) mobilde oturum alamaz, bu yüzden ayrı bir aşamaya gerek yok.
- `_layout.tsx` kendi `session` state'ini bırakıp `useAuth()` kullanır; yan etkiler (push, RevenueCat, odak kalıcılığı, çıkış temizliği) `_layout`'ta kalır. `SubscriptionContext` `userId` ve `stage`'i `useAuth()`'tan alır, kendi dinleyicisini bırakır.
- Aşama geçişleri: `USER_UPDATED` olayı ve `refreshSession()` sonrası yeniden hesaplanır. Başka cihazda/tarayıcıda doğrulama yapılırsa yerel oturum eskidir; `pending_email` durumdayken `AppState` `active` olunca ve "Onayladım" düğmesinde `refreshSession()` + `getUser()` çağrılır.
- Kapılar (bölüm 6), RevenueCat (bölüm 8) ve paywall yalnızca `stage === 'ready'` iken açılır. `guest`, `pending_email` ve `needs_password` aşamaları uygulamayı ücretsiz özelliklerle kullanmaya devam eder.

## 6. Tek "hesap gerekli" kapısı

### 6.1 API

```ts
// apps/mobile/src/hooks/useRequireAccount.ts
type AccountReason = 'paywall' | 'ai' | 'integration' | 'backup' | 'login_switch'
function useRequireAccount(): { stage: AccountStage | null; requireAccount(reason: AccountReason): boolean }
```

- `requireAccount` `stage === 'ready'` ise `true` döner. Değilse `false` döner ve aşamaya göre doğru adımı açar; `account_gate_shown` olayı yazılır (props: `reason`, `stage`):
  - `guest`: hesap kapısı modal'ı (`app/account-gate.tsx`, `reason` parametreli).
  - `pending_email`: kod girme adımı (bölüm 6.5).
  - `needs_password`: "Şifreni belirle" adımı (bölüm 6.5).
- Kapı modal'ı: başlık ve gövde `reason`'a göre değişir, üç düğme: "Hesap oluştur" (`/(auth)/register`, yükseltme modu), "Zaten hesabım var" (login, uyarılı, bkz. bölüm 7), "Şimdi değil".
- `useProGate.requirePro` içine, `isLoading` ve `isPro` kontrollerinden ÖNCE `if (!requireAccount('ai')) return false` eklenir. Böylece bulgu 1'deki sekiz çağrı yeri değişmeden misafiri yakalar. Paywall yönlendirmesi (`'free_limit'` dahil) `ready` olmayan aşamalarda hiç açılmaz.
- Kapı, hesap açma tamamlanınca (`stage === 'ready'`) önce "Hesabın kaydedildi" onayını gösterir (bölüm 8 madde 7), sonra kullanıcıyı geldiği ekrana geri döndürür: `router.back()`; çağıran taraf aksiyonu otomatik tekrarlamaz, kullanıcı düğmeye yeniden basar (YAGNI). `reason: 'ai'` ile gelen kullanıcı düğmeye yeniden bastığında paywall değil ilk ücretsiz AI hakkı çalışır; `post_signup` paywall'ı bu sonuçtan sonra gelir (bölüm 8 madde 7).

### 6.2 Çağrı yerleri (tam liste)

| Yer | Dosya | Davranış |
|---|---|---|
| Tüm AI düğmeleri | `useProGate.ts:11` (8 çağrı yeri, bulgu 1) | `requireAccount('ai')` |
| Profil: üyelik satırı | `app/(tabs)/profile.tsx:343-345` (`/paywall`) | `ready` değilse `requireAccount('paywall')` |
| Paywall rotası (savunma) | `app/paywall.tsx`, ekran açılışı | `ready` değilken doğrudan açılırsa (derin bağlantı, eski yığın) `router.replace` ile kapıya yönlendir, planlar yüklenmez |
| Entegrasyonlar | `src/components/settings/IntegrationsLink.tsx:15` ve `app/(tabs)/settings/integrations.tsx` | Google Takvim bağlama, Todoist içe aktarma ve Apple Hatırlatıcılar içe aktarma (`importReminders`, `integrations.tsx:49`) eylemlerinde `requireAccount('integration')`. Hatırlatıcıların sunucu rotası yok, kapı yalnızca istemcide (2026-10-28 kararı) |
| Entegrasyon sağlayıcı rotası | `app/integrations/[provider].tsx` | açılışta aynı koruma |
| Yedekleme hatırlatması | yalnızca profil ekranında kart (6.3) | düğme `register`'a gider |

İstemci kapısı atlatılsa ya da eski bir sürüm çağırsa bile sunucu aynı kuralı uygular (bölüm 9). Mobil, sunucudan gelen `403 account_required` yanıtını da kapıya eşler (entegrasyon ekranları ve `lib/ai.ts`).

### 6.3 Yedekleme hatırlatma kartı

- Yalnızca Profil'de, misafire her zaman görünür: "Hesabını kaydet, verilerin kaybolmasın" + "30 gün hiç açmazsan misafir verilerin silinir."
- Bugün ekranında banner ya da kart YOK (2026-10-29 kararı). Sebep `docs/rules/UX.md:83`: anasayfa sadece sekme özetlerinden oluşur, sekmesi olmayan kart anasayfaya konmaz. Rev. 3'teki kapatılabilir Bugün banner'ı bu kurala aykırıydı ve kaldırıldı.
- Kartın yolu görünür olmalı: Bugün'deki profil düğmesi (`app/(tabs)/today.tsx:128-145`) bugün yazısız bir ikon; persona testinde kullanıcı ne olduğunu tahmin ederek bastı. Düğme görünür "Profil" yazısı alır, `accessibilityRole="button"` ve `accessibilityLabel` taşır (`docs/rules/DESIGN.md:48`). Bu değişiklik misafire özel değil, herkes için.
- Kart `stage === 'guest'` dışında hiç render edilmez (`pending_email` ve `needs_password` için ilgili adım kartı bunun yerine, aynı yerde gösterilir, bölüm 6.5).

### 6.4 Kayıt ekranı (`app/(auth)/register.tsx`) değişiklikleri

Mod, `useAuth().stage`'e göre belirlenir.

- Yükseltme modu (`guest`): `signUp` (`:26`) yerine `supabase.auth.updateUser({ email, data: { display_name, timezone } })`. Başlık "Hesabını kaydet", alt metin "Verilerin bu hesaba bağlanır." Şifre alanı da toplanır ("En az 8 karakter" ipucu `:64`, yükseltmede min 8 doğrulaması eklenir) ama şifre bu adımda SUNUCUYA GÖNDERİLMEZ: yalnızca bileşen belleğinde tutulur (diske yazılmaz, günlüğe girmez) ve e-posta doğrulandıktan sonra 6.5'teki bitiş adımında kullanılır.
- Oturum yok (login'den gelen, çıkış yapmış): `signUp` KALKAR, ayrı bir "normal mod" yok (2026-10-28 kararı, tek kayıt yolu). Gönder'e basınca önce `bootstrapGuest()` (`signInAnonymously`, bölüm 4) çalışır, oturum gelince aynı `updateUser({ email, data })` çağrısıyla yükseltme moduna devam edilir; ekran ve metin yükseltme moduyla aynıdır. Kullanıcı kodu doğrulayana kadar misafir aşamasındadır: ücretsiz özellikler açık; AI, Pro ve entegrasyonlar kapalı. Bu kayıtlar da anonim giriş IP sınırına sayılır (bölüm 14.3).
- `signInAnonymously` başarısız olursa (ağ yok, 429, anonim giriş kapalı) hata ekranda, formun altında gösterilir ve girdiler korunur (UX 3); `signUp`'a geri düşülmez. Sonuç: anonim giriş anahtarı kapatılırsa yeni mobil sürümde kayıt da durur (giriş ve web kaydı çalışır). Kill switch kullanımı buna göre tartılır (bölüm 14.2 ve 16).
- `user_profiles` yazımı: `updateUser`'ın `data` alanı yalnızca `raw_user_meta_data`'yı değiştirir; `handle_new_user` yeniden çalışmaz. Bu yüzden hesap `ready` olunca `user_profiles.update({ display_name })` (`profiles_update` politikası kullanıcıya izin veriyor, `014:60-63`) çağrılır. Saat dilimi `notification_preferences.timezone`'a `syncTimezone` ile zaten yazılıyor (`setup.ts:26-48`).
- E-posta zaten kayıtlıysa `updateUser` hata döner: ekranda "Bu e-posta kayıtlı. Giriş yaparsan misafir verilerin geride kalır" metni ve "Giriş yap" düğmesi (bölüm 7'deki uyarı akışına gider). Hata kodu eşleşmesi Adım 0'da doğrulanır (bölüm 15).

### 6.5 Yükseltme adımları, bekleyen durum ve devam ettirme

Canlı durum: "Confirm email" bugün KAPALI (bulgu 15). Karar (2026-10-28): AÇILIR, anonim girişle aynı anda (bölüm 16). Açıkken yükseltmede kod adımı (aşama 2) her zaman çalışır. `config.toml` `enable_confirmations = false` (`:25`) yalnızca yerel geliştirme; Adım 0 ve yerel ortam için `true` yapılır ki canlıyla aynı olsun. Yükseltme iki aşamalıdır (Supabase'in dokümanlanmış akışı: önce e-posta doğrulanır, sonra şifre verilir) ve HER aşaması uygulama kapanıp açıldığında kaldığı yerden sürer. Ana kural: durum Auth'tan türetilir, yerel depo yalnızca ipucudur.

| Aşama | Auth'taki karşılığı | Ekran |
|---|---|---|
| 1. E-posta gönder | `updateUser({ email })` yapıldı | `register.tsx` yükseltme modu |
| 2. Kodu gir | `is_anonymous` true ve `new_email` dolu (`pending_email`) | `register.tsx` ikinci adım ("E-postanı onayla") |
| 3. Şifre belirle | `is_anonymous` false ve `password_set !== true` (`needs_password`) | ekran yok, şifre bellekteyse kendiliğinden; yoksa "Şifreni belirle" adımı |
| 4. Hazır | `is_anonymous` false ve `password_set === true` (`ready`) | yok |

1. Aşama 1 sonrası `updateUser` yanıtındaki `data.user` okunur: `user.new_email === girilenEposta` ise aşama 2 (Confirm email açıkken beklenen tek dal). `user.email === girilenEposta` ve `is_anonymous` false ise e-posta doğrulanmadan onaylanmış demektir; bu yalnızca Confirm email kapalıyken olur. Akış bozulmasın diye aşama 3'e geçilir, ama bu durum ayarın kapandığını gösterir ve yayın sonrası kontrolde aranır (bölüm 16 madde 6).
2. Aşama 2: "E-postana gelen 6 haneli kodu gir". Kod `supabase.auth.verifyOtp({ email, token, type: 'email_change' })` ile doğrulanır. Bağlantı yerine kod seçildi çünkü `_layout.tsx` yalnızca `reset-password` derin bağlantısını işliyor (`:38`). "Kodu tekrar gönder" `supabase.auth.resend({ type: 'email_change', email })` ile, 60 sn bekleme ile (`login.tsx:14` `RESET_COOLDOWN_SECONDS` kalıbı). Kodun süresi dolarsa aynı düğme çalışır. Uygulama bu ekranda kapanırsa yeniden açılışta `getUser()` `new_email`'i döndürür ve aynı ekran açılır; e-posta adresi `new_email`'den gelir (yerel depodan değil), kullanıcıdan tekrar istenmez.
3. Aşama 3 (şifre): kullanıcı doğrulanıp kalıcı olur olmaz çalışır. Aşama 1'de girilen şifre hâlâ bellekteyse (uygulama kapanmadıysa) `verifyOtp` başarılı döner dönmez şifre çağrısı KENDİLİĞİNDEN yapılır, ekran gösterilmez (2026-10-29 kararı: persona testinde dolu gelen ikinci şifre ekranı "neden aynı şeyi bir daha soruyorlar" sorusunu doğurdu). "Şifreni belirle" ekranı yalnızca şifre bellekte yoksa (uygulama kapandı, başka cihazda doğrulandı) ya da kendiliğinden çağrı başarısız olursa açılır ve şifre YENİDEN istenir. "Ek giriş gerekmez" vaadi verilmez; şifre yeniden girişi kabul edilmiş bir durumdur. Çağrı: `updateUser({ password, data: { password_set: true } })` (şifre ve bayrak tek çağrıda, atomik). Başarılı olunca `refreshSession()` ve `stage` `ready` olur. Kendiliğinden çağrı sırasında kod ekranındaki düğme yükleniyor durumunda kalır; kullanıcı arada boş bir ekran görmez.
4. `needs_password` aşamasındaki kullanıcı uygulamayı ücretsiz özelliklerle kullanabilir; Profil'de yedekleme kartının yerinde "Şifreni belirle" kartı durur (6.3; Bugün'e kart konmaz, `UX.md:83`), kapı (`requireAccount`) doğrudan bu adımı açar ve RevenueCat `logIn`'i ile paywall bu adım bitene kadar çalışmaz. Şifre çoğu yükseltmede kendiliğinden belirlendiği için bu aşama yalnızca kesintide oluşur; ilk hesap gerektiren anda kapı adımı açtığı için şifresiz kalıcı hesap fark edilmeden kalmaz.
5. Güvenlik ağı: şifresiz kalıcı kalan kullanıcı "Şifremi unuttum" akışıyla da şifre belirleyebilir (e-posta doğrulanmış olduğu için `resetPasswordForEmail` çalışır). Mevcut reset-password ekranı (`_layout.tsx:38` derin bağlantısı) şifreyi değiştirirken `data: { password_set: true }` de gönderir.
6. Başarısızlık yolları: `updateUser` yanıtı ağ hatası verirse aşama değişmez, ekran yeniden denenebilir kalır. `verifyOtp` yanlış kodda hatayı gösterir, aşama değişmez. Bekleyen e-postanın yanlış yazıldığı fark edilirse "E-postayı değiştir" aynı ekranda `updateUser({ email })` ile aşama 1'i yeniden çalıştırır.
7. Adım 0'ın (bölüm 15) doğrulayacağı noktalar: `updateUser({ email })` sonrası `new_email` ve `is_anonymous` değerleri, `verifyOtp type:'email_change'` sonrası `is_anonymous`'ın `false` olması, `updateUser({ password, data })` çağrısının kalıcı kullanıcıda şifre değişikliği için ek doğrulama istememesi (güvenli şifre değişikliği açıksa `reauthentication` gerekebilir), JWT'de `is_anonymous` claim'inin `refreshSession()` sonrası güncellenmesi, madde 8'deki şablonda `{{ if .Email }}` koşulunun anonim yükseltmede boş (misafir dalı), web e-posta değişikliğinde dolu (değişiklik dalı) değerlendirilmesi.
8. Sahibin yapacağı: dashboard'da "Change email address" şablonu Türkçe yazılır ve `{{ .Token }}` içerir (Authentication > Email Templates). Varsayılan şablon İngilizce ve yalnızca bağlantı içerir; persona testinde iki kullanıcı kodu İngilizce "Confirm Change of Email" metninin içinde aradı ve biri "ben e-posta değiştirmiyordum, kayıt oluyordum" dedi (2026-10-29 kararı). Şablon web'deki e-posta değişikliğiyle ortak (`apps/web/components/settings/SettingsClient.tsx:257`, `updateUser({ email })`, kullanıcı bağlantıya basar), bu yüzden iki dallıdır. Konu: "LifeOS doğrulama kodun". Gövde taslağı:

   ```html
   <h2>{{ .Token }}</h2>
   {{ if .Email }}
   <p>E-posta adresini {{ .NewEmail }} olarak değiştirmek için bu kodu gir ya da bağlantıya bas.</p>
   <p><a href="{{ .ConfirmationURL }}">E-posta değişikliğini onayla</a></p>
   {{ else }}
   <p>Hesabını kaydetmek için bu 6 haneli kodu LifeOS'a gir. Verilerin hesabına bağlanır.</p>
   {{ end }}
   <p>Bu isteği sen yapmadıysan bu e-postayı yok say.</p>
   ```

   Kod en üstte ve büyük; misafir dalında eski/yeni adres satırı ve bağlantı yok (eski adres boş, bağlantı mobilde işlenmiyor, madde 2). Değişiklik dalı web'in bağlantısını korur.

### 6.6 Web kayıt formları (Confirm email açılınca)

Web anonim giriş açmaz, `signUp` kalır. Ama Confirm email açılınca `signUp` oturum döndürmez (bulgu 16) ve bugünkü formlar kullanıcıyı oturumsuz `/dashboard`'a gönderir. İki formda (`RegisterForm.tsx:23`, `LoginForm.tsx:103`) aynı küçük değişiklik:
- `options.emailRedirectTo: ${origin}/auth/callback?next=/dashboard` (callback zaten `exchangeCodeForSession` yapıyor, `auth/callback/route.ts:33`) ve `options.data.password_set = true`.
- `data.session` boşsa `/dashboard`'a gidilmez; formun yerinde "E-postana gelen bağlantıyla hesabını onayla" durumu ve "Tekrar gönder" (`supabase.auth.resend({ type: 'signup', email })`, 60 sn bekleme) gösterilir. `data.session` doluysa (Confirm email kapalı) bugünkü davranış.
- Bu değişiklik Confirm email açılmadan ÖNCE web yayınıyla canlıya çıkar (bölüm 16). "Confirm signup" şablonu bağlantılı varsayılan şablondur, değiştirilmez.

## 7. Giriş ekranı değişiklikleri (misafir mevcut hesaba giriyor)

- Login ekranı oturum yokken olduğu gibi çalışır, artık oturum açıkken de (misafir) açılabilir: (a) kapıdaki "Zaten hesabım var", (b) onboarding ilk slayt bağlantısı, (c) kayıt ekranında e-posta çakışması.
- Misafir oturumdayken (`is_anonymous` true, yani `guest` ve `pending_email`) `signInWithPassword` çağrısından ÖNCE misafirin verisi sayılır (2026-10-29 kararı, rev. 3'teki "her zaman uyarı, sorgu yok" kuralının yerine): `tasks`, `meals`, `time_blocks` ve `workouts` tablolarında `select('id', { count: 'exact', head: true })`, dört istek paralel. RLS yalnızca misafirin kendi satırlarını sayar; kayıt tetikleyicileri bu tablolara varsayılan satır yazmıyor (`001`, `013`, `019`), yani sayı kullanıcının kendi girdisidir.
  - Toplam sıfırsa uyarı gösterilmez, giriş doğrudan yapılır. Persona testinde yeni telefonda eski hesabına giren, hiç verisi olmayan kullanıcı uyarıda "önemli bir şey mi siliyorum" diye duraksadı.
  - Sıfırdan büyükse uyarı sayıyla gösterilir, yalnızca sıfır olmayan türler yazılır: "Bu cihazda 3 görevin ve 2 öğün kaydın var. Bunlar hesabına taşınmaz ve kaybolur. Devam edersen yalnızca hesabındaki veriler görünür." Düğmeler: "Vazgeç", "Giriş yap, misafir verisini bırak".
  - Sayım başarısız olursa (ağ, zaman aşımı, 3 sn) uyarı sayısız metinle yine gösterilir: "Bu cihazdaki misafir verilerin hesabına taşınmaz ve kaybolur. Devam edersen yalnızca hesabındaki veriler görünür." Bilinmeyen durumda güvenli taraf uyarmaktır.

  Gerekçe: veri kaybı riski yalnızca veri varken vardır; uyarıyı her girişte göstermek, verisi olmayan kullanıcıyı korkutup asıl uyarının değerini düşürüyordu. Sayı, kullanıcıya neyi kaybedeceğini tahmin ettirmek yerine söyler. Oturum hiç yoksa (çıkış yapılmış, login ekranı) uyarı gösterilmez.
- Başarılı girişten önce `unregisterPushTokenAsync()` (misafirin token satırı bu cihazdan kopar, `setup.ts:189`). Eski misafir kullanıcı satırı geride kalır, temizlik cron'u siler (bkz. bölüm 12). Hemen silmeye çalışılmaz (YAGNI, ve silme yetkisi istemcide yok).
- Kullanıcı kimliği (`id`) DEĞİŞTİĞİ HER anda (`SIGNED_OUT` ya da farklı `id` ile `SIGNED_IN`, misafir olsun olmasın) iki şey sırayla çalışır:
  1. `resetLocalUserState()` (`_layout.tsx:70-76` içeriği bir fonksiyona çıkarılır): store'lar, odak kalıcılığı, widget anlık görüntüsü.
  2. Yetki durumu sıfırlanır: `SubscriptionContext` `state`, `storePro` ve `sdkReady` değerlerini, yeni kullanıcının sonucu gelmeden ÖNCE, eşzamanlı olarak boşaltır; ardından RevenueCat kimliği kuyruğa girer (bölüm 8). Yani A kullanıcısının Pro görünümü B'ye hiçbir an sızmaz; yalnızca misafirden geçişte değil, kalıcı hesaptan kalıcı hesaba geçişte de.
  `focusPersist` zaten `userId` değişimini izliyor (`:57-65`). Görev/beslenme/planlama store'larının kullanıcı değişince yeniden çekildiği implementer tarafından doğrulanır.

## 8. RevenueCat kimlik kuralları

Kural: `Purchases.logIn(userId)` yalnızca `stage === 'ready'` (kalıcı kullanıcı ve `password_set === true`) için çağrılır. RevenueCat, `logIn` çağrılmadığında kendi anonim kimliğini kullanır; webhook bunu zaten yok sayıyor (`supabase/functions/revenuecat-webhook/index.ts:98-104`, `app_user_id` Supabase kullanıcısı değilse atlanır).

1. Tek serileştirme kuyruğu: `purchases.ts` içinde modül düzeyinde bir `Promise` zinciri (`rcQueue`). `logIn`, `logOut`, `configure` ve kimlik okuma yalnızca bu kuyruktan geçer; iki kullanıcı değişimi hiçbir zaman iç içe çalışmaz. Dışarıya tek fonksiyon: `syncRevenueCatIdentity(target: string | null)`. `target` kuyruğa girerken değil, görev ÇALIŞIRKEN son istenen değer okunur (araya giren daha yeni bir değişiklik eskisini ezer, ara adımlar atlanır). Görev: `target` doluysa ve SDK `getAppUserID()` farklıysa `logIn(target)`; `target` null ise ve SDK anonim değilse `logOut()` (anonim kullanıcıda `logOut` hata verir, hata yutulur). `initRevenueCat`/`resetRevenueCat` bu fonksiyona indirgenir.
2. `_layout.tsx:55`'teki doğrudan çağrı kalkar. Yerine tek bir etki: `(userId, stage)` her değiştiğinde `syncRevenueCatIdentity(stage === 'ready' ? userId : null)`. Misafirde, `pending_email`'de ve `needs_password`'te hedef null, yani RevenueCat anonim kalır. Çıkışta da aynı yoldan `null` gider (ayrı `Purchases.logOut` çağrısı yok).
3. Eski kullanıcıya ait yanıtları yok say: `SubscriptionContext` güncel kullanıcıyı bir `ref`'te tutar. Her asenkron okuma (Supabase `subscriptions` satırı, `getCustomerInfo`, müşteri bilgisi dinleyicisi) başlarken `uid`'i yakalar ve sonucu yazmadan önce iki şeyi doğrular: `uid === ref.current.userId` ve (mağaza verisi için) SDK `getAppUserID() === uid`. Biri tutmuyorsa sonuç atılır. Müşteri bilgisi dinleyicisi de aynı kontrolden geçer.
4. `isPro` türetimi: `stage === 'ready' && (dbPro || (sdkReady && storePro))`. Diğer tüm aşamalarda `false` (`SubscriptionContext.tsx:179` bu hale gelir). Misafirde `refreshStore` hiç çağrılmaz, durum `FREE_STATE`.
5. Satın alma ve geri yükleme: `canPurchase = stage === 'ready' && sdkUserId === userId`. `sdkUserId` kuyruk görevi bittiğinde `getAppUserID()` ile güncellenen state'tir. Paywall'da satın alma ve "Satın alımları geri yükle" düğmeleri `canPurchase` olana kadar devre dışı ve kısa bir yükleniyor durumu gösterir. Ayrıca `purchasePlan` ve `restorePurchases` (`purchases.ts:187`, `:203`) çağrıdan hemen önce `getAppUserID()`'yi güncel kullanıcıyla karşılaştırır; uyuşmazsa `'unavailable'` döner. Böylece iki kullanıcının hızlı geçişinde satın alma yanlış kimliğe yazılamaz.
6. Yükseltme: `stage` `ready` olunca (şifre belirlenip bayrak yazıldıktan sonra) madde 2'deki etki `logIn(uid)`'i bir kez çalıştırır. Aynı `uid` olduğu için kimlik birleştirme gerekmez. E-posta doğrulanmış ama şifre henüz belirlenmemişse RevenueCat'e hiç dokunulmaz.
7. Paywall: `ready` olmayan aşamalarda açılmaz (6.2). Hesap açılınca, `stage` bu kullanıcı için ilk kez `ready` olduğunda, paywall bir kez açılır (`source: 'post_signup'`), MUST (2026-10-28 kararı). Zamanı 2026-10-29 kararıyla değişti, "bir kez, mutlaka" kuralı aynen kalır:
   - Önce "Hesabın kaydedildi" onay ekranı: "Verilerin güvende. Telefonun değişse de bu e-posta ve şifreyle hepsi geri gelir." Tek düğme "Devam et". Persona testinde paywall onaydan önce çıkınca kullanıcı kaydın bitip bitmediğinden emin olamadı, ödemeyi kaydın şartı sandı.
   - Kapıya `reason: 'ai'` ile gelindiyse: "Devam et" kullanıcıyı geldiği ekrana döndürür (6.1). AI düğmesine bastığında ilk ücretsiz hakkını kullanır; paywall bu ilk ücretsiz AI sonucu ekranda gösterildikten sonra açılır ve kalan ücretsiz hakkı yazar ("2 ücretsiz AI planın kaldı", kaynak `useFreeAiPlans`, `ai_allowance()`). Persona testinde AI'ı deneyen ücretsiz kullanıcı hesap açar açmaz paywall'a çarptı, ücretsiz hakkı hiç görmedi ve AI'ı tamamen paralı sandı. Kullanıcı o oturumda AI'ı kullanmazsa paywall bir sonraki AI sonucundan sonra açılır; anahtar `pending` kaldıkça bekler.
   - Diğer tüm nedenlerde (`backup`, `paywall`, `integration`) ve doğrudan kayıtta: paywall onay ekranındaki "Devam et"ten sonra açılır, kapanınca kullanıcı geldiği ekrana döner.
   - "Bir kez" kullanıcıya bağlı anahtarla tutulur (`AsyncStorage`, `lifeos_post_signup_paywall:<uid>`, değerler `pending_ai` ve `shown`); yalnızca misafirden yükseltmede tetiklenir, mevcut hesaba girişte değil. RevenueCat kimliği eşleşmeden (`canPurchase`, madde 5) düğmeler pasif kalır, ekran yine açılır. `paywall_view` olayının `source` değerleri arasına `post_signup` eklenir.
8. Hesap açıldıktan sonraki hatırlatmalar (2026-10-28 kararı, dört kanal da seçildi, hepsi sıklık sınırlı): AI özelliğine dokununca o özelliğin somut faydasını anlatan metin; işe yarayacağı anda tek satır ipucu (ör. öğünü elle girerken "Tek cümleyle yaz, AI ayırsın"); günlük bildirim havuzunda haftada en çok bir AI fayda satırı (`daily-digest/copy.ts` havuz deseni); Bugün ekranında kart (UX 6: önce emülatörde ekranın bugünkü hali tartılır). Sahibin notu: AI özelliklerinin faydası yeterince anlatılmıyor; paywall ve teklif metinleri somut fayda söyler. Bu madde misafir modunun parçası değil, ayrı spec ve iş (bölüm 17); misafir modu yalnızca `post_signup` paywall'ını getirir.

## 9. Sunucu kapıları (kalıcı hesap şartı)

Genel kural: kullanıcı JWT'siyle erişilen ve para harcayan ya da üçüncü tarafı çağıran her sunucu girişi `user.is_anonymous === true` ya da `!user.email_confirmed_at` ise reddeder: HTTP 403, gövde `{ code: 'account_required' }`. Onaysız e-posta şartı 2026-10-28 kararıdır (bölüm 18, madde 1): web'de `signUp` yapıp bağlantıya basmayan kullanıcı oturum almaz, ama Confirm email açılmadan önce oluşmuş ya da ayar kapalıyken doğrulamasız onaylanmış bir hesap bu şartla yakalanır. Mobil istemci kapısı bunun önünde durur ama güvenlik sınırı sunucudur. `password_set` sunucuda kontrol edilmez (istemci tarafından yazılabilir bir bayrak, bölüm 5).

Not: `feature/ai-model-routing` develop'a girdi (#37); satır numaraları aşağıda o halden alındı. Web rotası eklemeleri AI fonksiyonlarına bağlı değildir ve önce yayınlanabilir.

| Giriş | Tür | Kural |
|---|---|---|
| `ai-suggest` | edge function | 403 `account_required` (aşağıda) |
| `parse-meal` | edge function | 403 DÖNMEZ: model katmanı kapalı, kural katmanı çalışır (aşağıda) |
| `app/api/integrations/google/start` | Next.js rotası | 403 `account_required` |
| `app/api/integrations/google/complete` | Next.js rotası (`completeHandoff` içinde) | 403 `account_required` |
| `app/api/import/todoist` | Next.js rotası | 403 `account_required` |
| `app/api/integrations/google/callback` | tarayıcı yönlendirmesi, JWT yok | ek kapı gerekmez: `state` yalnızca `start`'tan üretilir, `start` kapalı |
| `app/api/integrations/google/disconnect` | Next.js rotası | KAPALI DEĞİL: kullanıcı bağlantıyı her zaman kesebilmeli |
| `app/api/payment/create` | Next.js rotası, çerez oturumu | 403 `account_required` (savunma; mobil misafirin web çerezi yok, ama ödeme başlatma kalıcı hesap ister) |
| `app/api/api-keys` | Next.js rotası, çerez oturumu | 403 `account_required` (savunma, Inbox API anahtarı kalıcı hesaba ait) |
| `daily-report`, `delete-account` | edge function | değişmez (model çağırmıyor, silme her zaman serbest) |
| `calendar-sync`, `send-email`, `daily-digest`, `event-notifications`, `revenuecat-webhook` | cron / service role / secret | kullanıcı JWT'siyle erişilemez, kapı gerekmez. Yalnızca `send-email`'in e-postası olmayan satırı atladığı implementer tarafından doğrulanır |

Web rotaları uygulaması (bulgu 12):
- `apps/web/lib/api/auth.ts` `authenticateRequest` dönüşüne `isAnonymous: user.is_anonymous === true` ve `emailConfirmed: Boolean(user.email_confirmed_at)` ekler. Çerez yolu ve Bearer yolu aynı `user` nesnesinden okur.
- Aynı dosyaya küçük bir yardımcı: `requirePermanent(auth)`. `auth.isAnonymous || !auth.emailConfirmed` ise `NextResponse.json({ ok: false, error: 'Hesap gerekli', code: 'account_required' }, { status: 403 })` döner, değilse `null`. Her rota `authenticateRequest` sonrası (`401` kontrolünden hemen sonra) bunu çağırır. `payment/create` ve `api-keys` kendi `supabase.auth.getUser()` kullandığı için `user.is_anonymous` ve `user.email_confirmed_at` doğrudan okunur.
- Başka bir yazma yolu yok: `integrations` tablosunda INSERT politikası bulunmuyor (`056:40-44`), `oauth_states` ve `calendar_*` tabloları yalnızca admin istemciyle yazılıyor (RLS açık). Rotalar kapanınca misafir bağlantı kuramaz.
- Mobil: entegrasyon ekranları rotadan `403 account_required` alırsa `requireAccount('integration')` ile kapıyı açar (eski bir sürümün kapısı olmasa bile sunucu korur).

AI edge function eklemeleri:
- `ai-suggest/index.ts`: `auth.getUser()` sonrası (`:53`), `resolveAiAccess`'ten ÖNCE (`:62`): `if (user.is_anonymous || !user.email_confirmed_at) return json({ error: 'Account required', code: 'account_required' }, 403)`. `resolveAiAccess` imzası değişmez; misafirin ücretsiz 3 plan hakkına erişmesi bu satırla kapanır.
- `parse-meal/index.ts`: `getUser()` sonrası (`:91`) 403 DÖNME. Misafirde ya da e-postası onaysız kullanıcıda `planMealAi(access)` (`:121`) sonucu model katmanını kapatacak biçimde ezilir: `pro` ve `useModel` false olur. Kural katmanı çalışır, öğün kaydı durmaz. Ezme `planMealAi`'ın içine değil çağrı yerine yazılır (fonksiyon saf kalsın, testleri değişmesin).
- Mobil `callAiSuggest` (`apps/mobile/src/lib/ai.ts:55-57`) 402 ve 403'ü `pro_required` olarak eşliyor. 403 gövdesindeki `code === 'account_required'` ayrıştırılır ve `AiAccessError`'a yeni bir kod eklenir: `'account_required'`. Böylece `planning.tsx:259` misafirde paywall açmaz, kapıyı açar. Bu mobil değişiklik bağımsızdır ve sunucu kapısından önce de güvenle yayınlanabilir.
- `shared/supabase/reports.ts:61` ve `lifeSetup.ts:35` `supabase.functions.invoke` kullanıyor ve hata alırsa fırlatıyor; çağıran ekranlar zaten `requirePro` arkasında, ek işlem yok.

## 10. Bildirimler (misafir)

- Misafir bildirim alır: `daily-digest` ve `event-notifications` `push_tokens`'tan okuyor, misafirin görev/blokları var; sunucu tarafında değişiklik yok. `notification_preferences` satırı `create_default_notification_preferences` trigger'ıyla açılıyor (`019:61-73`), misafir için de oluşur.
- Değişiklik yalnızca istemcide: `registerForPushNotificationsAsync({ prompt })` (`setup.ts:83`). `prompt: false` iken yalnızca `getPermissionsAsync` bakılır, izin yoksa sessizce `null` döner. `_layout.tsx:54` misafirde `prompt: false` çağırır. `prompt: true` yalnızca bağlamda (2026-10-29 kararı, bölüm 4): ilk zaman bloğu kaydedildiğinde (`packages/shared/src/supabase/planning.ts:128` ekleme yolunu çağıran mobil ekran, izin henüz sorulmadıysa bir kez) ve bildirim ayarı ekranında. Onboarding `finish()` izin istemez. Kalıcı kullanıcı davranışı aynen kalır.
- Yükseltmede `uid` aynı, token satırı yerinde kalır, yeniden kayıt gerekmez.
- Akşam rapor bildirimi (`enableReportOnce`) `user.created_at` 24 saatten yeniyse açılıyor (`setup.ts:61-78`): misafir de yeni sayılır, davranış değişmez.
- Misafir çıkışta `unregisterPushTokenAsync` ile token siler, cihaza başka hesap bildirimi karışmaz (mevcut mantık).

## 11. Çıkış, hesap silme ve analitik

Çıkış (`profile.tsx:260-274`, `handleSignOut`):
- Misafirde metin değişir: "Misafir verilerin yalnızca bu oturumda. Çıkış yaparsan geri alınamaz biçimde kaybolur." Düğmeler: "Vazgeç", "Hesap oluştur" (önerilen, kapıya gider), "Yine de çık" (destructive). Kalıcı kullanıcı metni aynı kalır.
- Çıkış sonrası login ekranı (bölüm 4 kuralı), misafir verisi sunucuda kalır ama erişilemez, cron siler.

Hesap silme (`profile.tsx:284-312`, `delete-account`):
- Edge function misafirle aynen çalışır (`getUser` ve `admin.deleteUser`, `delete-account/index.ts:56-61`; misafirin entegrasyonu olmadığı için `revokeIntegrations` boş döner). Sunucu değişikliği yok.
- Misafirde metin "Hesabı sil" yerine "Tüm verilerimi sil" olur, aynı iki aşamalı onay. Silme sonrası `SIGNED_OUT`, login ekranı.

Analitik (değişmez yaşam döngüsü olayları):
- Sorun: `events` hem `ON DELETE CASCADE` (bulgu 5) hem de istemci tarafından yazılabilir. İstemciden yazılan bir `guest_started`, hesap silinince/temizlik cron'u çalışınca kaybolur ve dönüşüm oranı şişer (silinenler paydadan düşer); ayrıca sahte olay yazılabilir.
- Çözüm, migration `073_` içinde:
  1. `events_name_check` üç ad kazanır: `account_gate_shown` (istemci yazar; props `reason`, `stage`), `guest_started` ve `account_upgraded` (yalnızca veritabanı yazar).
  2. `events.user_id` NULL alabilir ve FK `ON DELETE SET NULL` olur. Silinen kullanıcının olay satırı kalır, kimlik bağı kopar (`props` zaten kişisel veri içermiyor, `040:35`). Bu, mevcut kalıcı kullanıcıların hesap silmesi için de geçerli olur (kabul, 2026-10-28).
  3. `events_insert_own` politikası sıkılaştırılır: `WITH CHECK (auth.uid() = user_id AND name NOT IN ('guest_started', 'account_upgraded'))`. İstemci bu iki olayı yazamaz.
  4. `auth.users` üzerinde `SECURITY DEFINER` iki tetikleyici: `AFTER INSERT ... WHEN (NEW.is_anonymous)` -> `guest_started`; `AFTER UPDATE OF is_anonymous ... WHEN (OLD.is_anonymous AND NOT NEW.is_anonymous)` -> `account_upgraded` (props: `{ guest_age_days }`). Anonim girişi ve e-posta doğrulama sonrası `is_anonymous` geçişi Supabase tarafında bu sütunlara yazıldığı için istemci hiç rol oynamaz. Tetikleyicinin gerçekten çalıştığı Adım 0'da yerel/staging ortamında doğrulanır (bölüm 15).
- Dönüşüm sorgusu: `analytics.guest_conversion` görünümü, hafta bazında `count(*) FILTER (WHERE name = 'guest_started')` ve `account_upgraded` sayıları. Silinen kullanıcılar sayıdan düşmez.
- `analytics.user_funnel` ve türevleri: "register" artık `user_profiles.created_at` değil, kalıcı olma anı olarak yeniden tanımlanır (doğrudan `signUp` yapanlar için `created_at`, yükseltenler için `account_upgraded` zamanı); misafir sayısı ayrı sütun olur. Kural: "kayıt = kalıcı hesap". Görünümlerin yeniden yazımı implementer işi; migration sırasında `040` ve sonraki migration'lardaki view tanımları okunup etkilenenler listelenir.
- `paywall_view` olayı için misafir bağlamı gerekmiyor (misafir paywall'ı görmüyor).

Gizlilik politikası (`apps/web/app/(legal)/gizlilik-kvkk/page.tsx`, 2026-10-29 kararı): misafir modu canlıya çıkmadan önce "8. Hesap ve Veri Silme" bölümünden önce yeni bir "Misafir Kullanım" bölümü eklenir. Persona testinde kullanıcı 30 gün sonra silinme kuralının politikada yazdığını varsaydı; bugün yazmıyor (KVKK aydınlatma yükümlülüğü). İçerik dört cümle:
- Hesap açmadan kullanırken uygulama sana e-posta ya da ad istemeyen anonim bir kimlik oluşturur.
- Bu sürede girdiğin veriler (görev, plan, öğün, antrenman) hesaplı kullanımda olduğu gibi sunucularımızda saklanır.
- Uygulamayı 30 gün hiç açmazsan anonim kimlik ve ona bağlı tüm veriler kalıcı olarak silinir.
- Hesap oluşturduğunda aynı veriler aynı kimlikle hesabına bağlanır, taşıma ya da kopyalama yapılmaz.
Metin hukuki gözden geçirme gerektirirse (SAHİP) bölüm 16 madde 3'teki web yayınından önce kesinleşir.

## 12. Veritabanı: temizlik cron'u, CASCADE doğrulaması, geriye dönük doldurma

Yeni migration `073_` (071 ve 072 başka dallarda ayrıldı, paralel oturum çakışmasına dikkat, bkz. proje hafızası "migration-number-collisions"). Tek dosyada sırayla: (1) olay adları ve `events` değişikliği (bölüm 11), (2) kalıcı kullanıcılar için `password_set` doldurma, (3) temizlik fonksiyonu ve cron.

**Geriye dönük doldurma** (bölüm 5, 6.5): mevcut kalıcı kullanıcılar şifre belirleme adımını görmesin diye, yükseltme akışı yayına girmeden önce:
```sql
UPDATE auth.users
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"password_set": true}'::jsonb
WHERE NOT is_anonymous
  AND COALESCE(encrypted_password, '') <> ''
  AND raw_user_meta_data->>'password_set' IS NULL;
```
Şifresiz kalıcı hesap var: canlıda 6 Google hesabından 5'i şifresiz (bulgu 15). Doldurma onlara yazmaz; onları `needs_password`'e düşürmeyen şey bölüm 5'teki OAuth kuralıdır (email dışı kimliği olan kalıcı kullanıcı `ready`). `auth.users`'a postgres rolüyle yazılabildiği ve `handle_new_user`'ın yalnızca INSERT'te çalıştığı yerel şema kopyasında doğrulanır.

**Temizlik**: pg_cron doğrudan SQL çalıştırır, `net.http_post` ve gömülü anahtar gerekmez. Silme koşulu SİLME İFADESİNİN İÇİNDE yeniden değerlendirilir, böylece aday seçimi ile silme arasında etkinlik ya da yükseltme olursa satır silinmez.

```sql
-- Son etkinlik: oluşturma, son giriş ve oturum yenilemelerinin en yenisi
CREATE OR REPLACE FUNCTION public.guest_is_stale(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT GREATEST(
           u.created_at,
           COALESCE(u.last_sign_in_at, u.created_at),
           COALESCE((SELECT MAX(COALESCE(s.refreshed_at, s.updated_at, s.created_at))
                     FROM auth.sessions s WHERE s.user_id = u.id), u.created_at)
         ) < NOW() - INTERVAL '30 days'
  FROM auth.users u WHERE u.id = p_user;
$$;

CREATE OR REPLACE FUNCTION public.purge_stale_guests(p_limit int DEFAULT 1000) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_deleted int;
BEGIN
  WITH candidates AS (
    SELECT u.id FROM auth.users u
    WHERE u.is_anonymous AND public.guest_is_stale(u.id)
    ORDER BY u.created_at
    LIMIT p_limit
    FOR UPDATE OF u SKIP LOCKED          -- yükseltme/giriş UPDATE'i satırı kilitler
  )
  DELETE FROM auth.users d
  USING candidates c
  WHERE d.id = c.id
    AND d.is_anonymous                    -- kilit alındıktan sonra yeniden kontrol (yükseltildiyse silinmez)
    AND public.guest_is_stale(d.id);      -- etkinlik geldiyse silinmez
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END $$;

REVOKE ALL ON FUNCTION public.guest_is_stale(uuid), public.purge_stale_guests(int)
  FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('purge-stale-guests', '30 3 * * 1', $$SELECT public.purge_stale_guests(1000)$$);
```

- Neden `last_sign_in_at` tek başına yetmez: token yenilemesi bu sütunu güncellemiyor; her gün kullanan bir misafir 30 gün sonra silinirdi. Etkinlik işareti `auth.sessions` yenileme zamanı (uygulama açıkken en az saatlik yenileniyor, `jwt_expiry = 3600`, `config.toml:19`). Sütun adları (`refreshed_at`, `updated_at`) canlı şemada doğrulanmalı (yerel PostgreSQL 18 katalog kopyası yöntemi, proje hafızası "Yerel migration testi").
- Yarış penceresi: bir yükseltme ya da giriş `auth.users` satırını güncellediği için satır kilidi alır ve `DELETE` bunu görür (`SKIP LOCKED` adayı atlar; kilit sonradan alınırsa `d.is_anonymous` yeniden kontrolü yükseltmeyi yakalar). Oturum yenilemesi ise `auth.users` satırını kilitlemez; 30 gün hiç yenilenmemiş bir oturumun TAM silme milisaniyesinde yenilenmesi mümkün ama pratikte önemsiz bir penceredir (kullanıcı 30 gün sonra tam o an uygulamayı açmış olmalı ve veri yine de zaten 30 gündür kullanılmıyor). Bu kabul edilen kalan risktir.
- Dönüş değeri (`v_deleted`) `cron.job_run_details`'ta görünür; ilk koşuda beklenen silinen sayısı 30 gün boyunca sıfırdır.
- Cron'un `auth.users`'tan silme yetkisi (fonksiyon sahibi rol) yerelde denenir.
- Misafir hiç ödeme yapamadığı için (kapı) abonelik riski yok.

**CASCADE doğrulaması** (migration dosyaları tarandı): kullanıcıya bağlı tüm tablolar `auth.users(id) ON DELETE CASCADE`: `user_profiles`, `tasks`, `time_blocks`, `daily_plans` (001); `nutrition_targets`, `meals`, `food_items` (002); `workouts` (005); `subscriptions`, `payment_history` (013); `workout_programs` (016); `notification_preferences`, `push_tokens` (019); `health_daily`, `health_settings` (028); `api_keys` (029); `notification_log` (031); `food_aliases`, `portion_memory` (032); `nutrition_feedback` (033); `events` (040; bölüm 11'de `SET NULL`'a çevriliyor); `weight_logs` (049); `calendar_feeds` (050); `routines`, `routine_exceptions`, `routine_completions` (054); `integrations` (056); `oauth_states`, `calendar_sync_outbox`, `calendar_busy` (057); `goals` (059); `focus_sessions` (060); `daily_reports` (065); `goal_entries` (066). Alt tablolar (`task_details`, `workout_sets`, `program_days`, `program_exercises`) üst satır üzerinden zincirleme silinir.

CASCADE OLMAYAN iki istisna: `food_gaps.user_id` `ON DELETE SET NULL` (`032_nutrition_resolution.sql:93`) ve, bu tasarımla, `events.user_id`. Silinen misafirin çözülemeyen yiyecek ifadeleri `user_id = NULL` ile kalır; küratörlük kuyruğu olduğu için bu davranış kalır (kabul, 2026-10-28; 032 davranışı değişmez). Depolama (`storage`) kullanılmıyor (mobil, shared ve migration'larda `storage.from` yok). Başka FK'siz `user_id` kolonu bulunamadı; implementer migration sırasında `information_schema` ile canlı şemada bir kez daha doğrular.

## 13. i18n metinleri

`apps/mobile/src/i18n.ts` depoda CRLF. Düzenleme CRLF'yi korumalı (aksi halde tüm dosya diff olur); commit öncesi `git diff --ignore-cr-at-eol` ile karşılaştır. Anahtarlar `tr` ve `en` bloklarına eklenir (mevcut yer: `onb_skip` satır 97 ve 536, `auth_*` 330 ve 766).

| Anahtar | TR | EN |
|---|---|---|
| `guest_continue` | Misafir olarak devam et | Continue as guest |
| `guest_have_account` | Zaten hesabım var | I already have an account |
| `gate_title_ai` | AI için hesap gerekli | Account needed for AI |
| `gate_title_paywall` | Pro için hesap gerekli | Account needed for Pro |
| `gate_title_integration` | Entegrasyon için hesap gerekli | Account needed to connect |
| `gate_body` | Hesabını kaydet, verilerin kaybolmasın. Şu anki verilerin hesabına bağlanır. | Save your account so you don't lose your data. Everything you have now moves with it. |
| `gate_create` | Hesap oluştur | Create account |
| `gate_not_now` | Şimdi değil | Not now |
| `backup_card_title` | Hesabını kaydet, verilerin kaybolmasın | Save your account so your data isn't lost |
| `backup_card_body` | 30 gün hiç açmazsan misafir verilerin silinir. | Guest data is deleted if you don't open the app for 30 days. |
| `upgrade_title` | Hesabını kaydet | Save your account |
| `upgrade_sub` | Verilerin bu hesaba bağlanır. | Your data will be linked to this account. |
| `upgrade_pending_title` | E-postanı onayla | Confirm your email |
| `upgrade_pending_body` | {email} adresine gelen 6 haneli kodu gir. | Enter the 6-digit code sent to {email}. |
| `upgrade_resend` | Kodu tekrar gönder | Resend code |
| `upgrade_change_email` | E-postayı değiştir | Change email |
| `upgrade_email_taken` | Bu e-posta kayıtlı. Giriş yaparsan misafir verilerin geride kalır. | This email is registered. Signing in leaves your guest data behind. |
| `setpw_title` | Şifreni belirle | Set your password |
| `setpw_body` | E-postan onaylandı. Hesabına sonra tekrar girebilmek için bir şifre belirle. | Your email is confirmed. Set a password so you can sign in again later. |
| `setpw_card` | Hesabını tamamla: şifreni belirle | Finish your account: set a password |
| `setpw_confirm` | Şifreyi kaydet | Save password |
| `switch_warn_title` | Misafir verisi kaybolacak | Guest data will be lost |
| `switch_warn_body` | Bu cihazdaki misafir verilerin hesabına taşınmaz ve kaybolur. Devam edersen yalnızca hesabındaki veriler görünür. | Your guest data on this device won't move to your account and will be lost. If you continue you'll only see your account's data. |
| `switch_warn_counted` | Bu cihazda {items} var. Bunlar hesabına taşınmaz ve kaybolur. Devam edersen yalnızca hesabındaki veriler görünür. | This device has {items}. They won't move to your account and will be lost. If you continue you'll only see your account's data. |
| `switch_warn_tasks` | {n} görevin | {n} tasks |
| `switch_warn_meals` | {n} öğün kaydın | {n} meal logs |
| `switch_warn_blocks` | {n} plan bloğun | {n} plan blocks |
| `switch_warn_workouts` | {n} antrenman kaydın | {n} workout logs |
| `switch_warn_and` | ve | and |
| `switch_warn_confirm` | Giriş yap, misafir verisini bırak | Sign in, leave guest data |
| `upgrade_done_title` | Hesabın kaydedildi | Your account is saved |
| `upgrade_done_body` | Verilerin güvende. Telefonun değişse de bu e-posta ve şifreyle hepsi geri gelir. | Your data is safe. Even on a new phone, this email and password bring it all back. |
| `upgrade_done_continue` | Devam et | Continue |
| `paywall_free_left` | {n} ücretsiz AI planın kaldı | {n} free AI plans left |
| `profile_button` | Profil | Profile |
| `guest_signout_title` | Çıkış yaparsan veriler kaybolur | Signing out erases your data |
| `guest_signout_body` | Misafir verilerin yalnızca bu oturumda. Çıkış geri alınamaz. | Guest data lives only in this session. Signing out can't be undone. |
| `guest_signout_confirm` | Yine de çık | Sign out anyway |
| `guest_delete_title` | Tüm verilerimi sil | Delete all my data |
| `guest_badge` | Misafir | Guest |

Sayılı uyarı birleştirmesi: sıfır olmayan parçalar sırayla (görev, öğün, plan bloğu, antrenman) dizilir; iki parça "A ve B", üç ve dört parça "A, B ve C". Türkçe parçalarda sayıdan sonra ek yok, iyelik ismin üstünde ("3 görevin"); `{n}` 1 olduğunda da aynı metin ("1 görevin"). Sayım başarısızsa `switch_warn_body` (sayısız) kullanılır.

`register.tsx` ve `login.tsx` bugün `t.*` yerine sabit string kullanıyor (`'Kayıt Ol'`, `'Giriş Yap'`); yükseltme moduna eklenen yeni metinler `t.*` ile yazılır, eski sabitler bu iş kapsamında taşınmaz.

## 14. Kenar durumlar

1. Çevrimdışı ilk açılış: `signInAnonymously` başarısız, login ekranı + "Misafir olarak devam et" yeniden dener. Ağ gelince çalışır; ek kuyruk yok.
2. Anonim girişin kapalı olması (dashboard anahtarı kapalı): aynı hata yolu, uygulama bugünkü gibi login ekranına düşer. Anahtar aynı zamanda kill switch olarak kullanılır (bölüm 16). Mobilde tek kayıt yolu anonim giriş olduğu için (6.4) anahtar kapanınca yeni mobil sürümde kayıt da durur: kayıt formu hatayı formun altında gösterir, mevcut hesaba giriş çalışır. Kill switch'i çekmenin bedeli budur.
3. IP başına 30/saat sınırı: operatör CGNAT'ı arkasında çok kullanıcı aynı IP'yi paylaşabilir. Aşılırsa 429, hata yolu 1 ile aynı. Sınır 30/saat kalır, 429 görülürse yükseltilir (2026-10-28 kararı). Doğrudan kayıtlar da artık anonim girişten geçtiği için bu sınıra sayılır.
4. Yeniden kurulum: oturum `SecureStore`'da; Android'de kurulumla silinir, misafir verisine erişim kaybolur (yeni misafir). iOS Keychain kurulum sonrası oturumu koruyabilir (platform davranışı; oturum varsa 4. bölümdeki ilk dal zaten devreye girer). Bu sınırlama yedekleme kartının varlık nedeni; ek çözüm yok.
5. Odak durumu ve widget anlık görüntüsü kullanıcıya bağlı anahtarlarla tutuluyor (`persistFocus(AsyncStorage, userId)`, `_layout.tsx:62`); yükseltmede `uid` aynı kaldığı için bir şey kaybolmaz. Kullanıcı değişince bölüm 7'deki sıfırlama çalışır.
6. Yükseltme sırasında `user.email` hâlâ null olabilir (bekleyen durum): profil e-posta alanı boş, rozet "Misafir".
7. Yükseltme herhangi bir aşamada kesilirse (uygulama kapandı, çağrı yarıda, başka cihazda doğrulama): bekleyen durum yerel depodan değil Auth'tan türetildiği için (bölüm 5 ve 6.5) yeniden açılışta doğru adım gösterilir. Doğrulanmış ama şifresiz kalıcı kullanıcı `needs_password` olarak yakalanır; RevenueCat ve paywall bu aşamada kapalıdır. Çağrının sunucuda tamamlanıp yanıtın kaybolduğu durum da aynı yolla çözülür (bir sonraki `getUser()` gerçeği söyler).
8. Misafir tek cihazlı (kasıtlı). Aynı hesapla ikinci cihazda giriş normal akış.
9. Misafir sayısı büyürse `auth.users` şişer: cron haftalık, LIMIT 1000 ile partiler halinde siler; birikme olursa sonraki hafta devam eder.
10. Web: `lifeos.tr` anonim giriş açmıyor. Değişiklik yalnızca API rotalarına sunucu kapısı (bölüm 9) ve kayıt formlarına onay bekleme durumu (6.6). Mobil misafir web'de giriş yapamaz (şifresi yok), beklenen.
11. Hızlı hesap değişimi (A çıkar, B girer, yanıtlar sıra dışı gelir): bölüm 7 (eşzamanlı sıfırlama), bölüm 8 madde 1 ve 3 (kuyruk ve eski yanıtı yok sayma) birlikte bunu kapsar; test planında ayrı vaka.

## 15. Test planı

Birim (projedeki mevcut test yapısına göre):
- Aşama türetimi (`deriveAccountStage`, saf fonksiyon): `is_anonymous` + `new_email` -> `pending_email`; kalıcı + bayrak yok -> `needs_password`; kalıcı + `password_set: true` -> `ready`; `undefined` ve `false` eşdeğer; kalıcı + şifresiz + `identities` içinde `google` -> `ready` (OAuth kuralı); kalıcı + `password_set: true` + `email_confirmed_at` boş -> `ready` DEĞİL.
- `useRequireAccount`: `guest` -> hesap kapısı, `pending_email` -> kod adımı, `needs_password` -> şifre adımı, `ready` -> `true`; her biri olay yazar.
- `useProGate.requirePro`: `ready` olmayan her aşamada paywall değil kapı; `ready` free'de paywall; Pro'da `true`.
- RevenueCat kuyruğu: (a) `stage !== 'ready'` iken `logIn` hiç çağrılmaz; (b) A -> B hızlı değişim: `logIn(A)` bitmeden B istenirse A'nın görevi iptal/ezilir, SDK kimliği B ile biter, A'nın gecikmiş müşteri bilgisi state'e yazılmaz; (c) `logOut` ve `logIn` iç içe çalışmaz (sahte `Purchases` ile sıra kaydı); (d) `canPurchase` SDK kimliği eşleşene kadar false, `purchasePlan` eşleşmezse `'unavailable'`.
- `SubscriptionContext`: kullanıcı değişiminde `isPro` aynı render turunda `false`'a düşer (kalıcıdan kalıcıya geçişte de), `storePro` true olsa bile `ready` değilse `isPro` false.
- `bootstrapGuest`: tek sefer çalışır; `lifeos_had_session` varsa çağrılmaz.
- Misafir -> giriş uyarısı (bölüm 7): dört sayım sıfırsa uyarı yok, giriş doğrudan; sıfırdan büyükse sayılı metin ve yalnızca sıfır olmayan türler (bir, iki ve dört parçalı birleştirme); sayımlardan biri hata verir ya da 3 sn'yi aşarsa sayısız uyarı; oturum yoksa sayım yapılmaz, uyarı yok.
- Otomatik şifre (6.5 madde 3): `verifyOtp` başarılı ve şifre bellekte -> `updateUser({ password, data: { password_set: true } })` kendiliğinden çağrılır, şifre ekranı açılmaz; şifre bellekte yok -> "Şifreni belirle" adımı; otomatik çağrı hata verir -> aynı adım, alan boş.
- `post_signup` sırası (8.7): onay ekranı her zaman paywall'dan önce; `reason: 'ai'` -> paywall ilk ücretsiz AI sonucundan sonra ve `paywall_free_left` sayısıyla, anahtar `pending_ai`; diğer nedenler ve doğrudan kayıt -> onaydan sonra; ikinci kez hiç açılmaz (`shown`); mevcut hesaba girişte hiç açılmaz.
- `callAiSuggest`: 403 + `account_required` -> `AiAccessError('account_required')`; 402 -> `pro_required`.
- Web rotaları: `authenticateRequest` anonim JWT'de `isAnonymous: true` döner; `google/start`, `google/complete`, `import/todoist`, `payment/create`, `api-keys` anonim jetonla ve e-postası onaysız kalıcı jetonla 403 `account_required`; onaylı kalıcı jetonla mevcut davranış; `google/disconnect` anonim jetonla da çalışır.
- Web kayıt formları (6.6): `signUp` `session: null` dönünce `/dashboard`'a gidilmiyor, onay bekleme durumu ve "Tekrar gönder" görünüyor; `session` dolu dönünce bugünkü davranış; `options.data.password_set === true` ve `emailRedirectTo` gönderiliyor.
- Edge function (Deno yok, bkz. proje hafızası "edge-function-typecheck-gap"): scratchpad `tsc` ile tip kontrolü; kapı mantığı saf fonksiyona (`isAiBlockedForGuest(user)`) çıkarılırsa node ile birim testlenir.
- Migration (yerel PostgreSQL 18 + canlı şema katalog kopyası): (1) 31 gün önceye tarihlenmiş misafir silinir, alt tablolar CASCADE ile gider, `food_gaps` istisnası ve `events` `SET NULL` doğrulanır; 29 gün önce olan silinmez; 31 gün önce oluşmuş ama `sessions` kaydı yeni olan silinmez. (2) Yarış: iki oturumda, birinde `purge_stale_guests` çalışırken diğerinde aynı misafirin `is_anonymous = false` UPDATE'i ve `last_sign_in_at` güncellemesi; yükseltilen ya da etkin olan satır silinmez. (3) `password_set` doldurma yalnızca şifreli kalıcı kullanıcıya yazar, anonimlere yazmaz, tekrar çalıştırınca değişmez. (4) `guest_started` tetikleyicisi anonim INSERT'te, `account_upgraded` `is_anonymous` true -> false UPDATE'inde tam bir satır yazar; istemci rolüyle bu iki adı INSERT etmek reddedilir.

Emülatör adımları (`windows-local-android-build` yöntemi):
0. Adım 0 (spike, kod yazmadan önce, yaklaşık 30 dk), YEREL SUPABASE (`supabase start`) ya da ayrı bir geçici/staging Supabase projesinde. ÜRETİMDE ANONİM GİRİŞ AÇILMAZ. Docker kurulu değilse ayrı geçici proje kullanılır (ücretsiz katman yeterli). Yerelde `config.toml`'a `enable_anonymous_sign_ins = true` ve `enable_manual_linking = true`, e-postalar yerel Inbucket'tan okunur. Doğrulanacaklar: (a) `updateUser({ email })` sonrası `new_email` ve `is_anonymous` değerleri, (b) `verifyOtp type:'email_change'` ile `is_anonymous` false oluyor mu ve `account_upgraded` tetikleyicisi çalışıyor mu, (c) `updateUser({ password, data: { password_set: true } })` kalıcı kullanıcıda ek yeniden doğrulama istiyor mu, (d) JWT claim yenilemesi için `refreshSession` gerekiyor mu, (e) kayıtlı e-postada hata kodu/mesajı, (f) uygulamayı iki aşama arasında kapatıp açınca `getUser()` ile bekleyen durumun doğru türediği, (g) Confirm email AÇIKKEN (`enable_confirmations = true`) anonim `updateUser({ email })` kod gönderiyor ve `new_email` dalına düşüyor mu; KAPALIYKEN e-posta doğrulamasız onaylanıp kullanıcı doğrudan kalıcı oluyor mu (6.5 madde 1'in iki dalı), (h) eski mobil `register.tsx` (`signUp`) Confirm email açıkken ekranda ne gösteriyor (bulgu 16; bölüm 16 madde 4'teki pencerenin bedeli), (i) "Change email address" şablonunda `{{ if .Email }}` anonim yükseltmede boş, web e-posta değişikliğinde dolu mu (6.5 madde 7 ve 8); boş değilse iki dallı şablon başka bir değişkenle ayrılır. Sonuca göre 6.4 ve 6.5 kesinleşir.
1. Temiz kurulum, hesap yok: giriş ekranı görünmeden onboarding açılır. Görev ekle, öğün kaydet, antrenman başlat.
2. Bildirim izin penceresi onboarding boyunca ve sonunda ("Başla" da "Atla" da) açılmaz. İlk zaman bloğu kaydedilince bir kez açılır; ikinci blokta açılmaz. Bildirim ayarı ekranında anahtar açılınca açılır.
3. Her AI düğmesine bas (8 çağrı yeri): hepsi hesap kapısı açar, paywall açılmaz. Profil üyelik satırı kapıyı açar. `adb` ile `paywall` rotasını derin bağlantıyla aç: kapıya yönlenir.
4. Entegrasyonlar: Google, Todoist ve Apple Hatırlatıcılar eylemi kapı açar (2026-10-28 kararı). Misafir jetonuyla web rotalarına doğrudan `curl`: 403 `account_required`.
5. Yedekleme kartı yalnızca profilde var; Bugün'de 3. görevden sonra da banner ya da kart yok (UX.md:83). Bugün'deki profil düğmesinde "Profil" yazısı görünüyor; TalkBack "Profil, düğme" okuyor. Kalıcı hesapta kart yok, düğme yazısı aynı.
6. Yükseltme, kesintisiz: e-posta + şifre, kod ekranı, kod gir. Ayrı şifre ekranı açılmıyor (şifre kendiliğinden kaydediliyor, kod düğmesi bu sırada yükleniyor). Gelen e-posta Türkçe, konu "LifeOS doğrulama kodun", kod en üstte, "e-posta değişikliği" ifadesi ve bağlantı yok. Ardından "Hesabın kaydedildi" onayı, "Devam et" ile paywall bir kez. Görevler yerinde, `uid` aynı, "Misafir" rozeti kayboldu, RevenueCat `logIn` şifre kaydedildikten sonra bir kez çalıştı (log). Uygulamayı kapatıp açınca paywall tekrar açılmıyor. Paywall artık açılıyor.
6c. AI kapısından yükseltme (`reason: 'ai'`): yükseltme sonrası onay, "Devam et" ile AI ekranına dönüş, paywall açılmadı. AI düğmesine yeniden basınca ilk ücretsiz plan çıkıyor, ardından paywall "2 ücretsiz AI planın kaldı" (sayı `ai_allowance()` ile aynı) yazısıyla bir kez açılıyor. Kullanıcı AI'ya hiç basmadan uygulamayı kapatıp açarsa paywall açılmıyor, sonraki ilk AI sonucundan sonra açılıyor.
6b. Oturumsuz kayıt (login ekranından "Kayıt ol"): `signUp` çağrılmıyor, `signInAnonymously` ve `updateUser({ email })` üzerinden kod ekranına gidiliyor (ağ isteği logu). Kod girilene kadar AI ve entegrasyonlar kapıda, görev ve öğün kaydı çalışıyor. Anonim giriş anahtarı kapalıyken aynı form hatayı formun altında gösteriyor, girdiler korunuyor.
7. Yükseltme, kesintili: (a) kod ekranındayken uygulamayı öldür/aç: aynı ekran, e-posta `new_email`'den geliyor; (b) kodu girdikten hemen sonra, otomatik şifre çağrısı bitmeden öldür/aç (ya da çağrıyı ağ kesilerek düşür): Profil'de "Şifreni belirle" kartı ve adımı çıkıyor, Bugün'de kart yok, şifre yeniden isteniyor (bellek gitti), o ana kadar paywall ve AI kapıda, RevenueCat anonim; şifre kaydedilince onay ve paywall sırası 6 ile aynı; (c) başka cihazda doğrula, uygulamaya dön: `refreshSession` ile aşama ilerliyor.
8. Kayıtlı e-posta ile yükseltme dene: çakışma mesajı ve uyarılı giriş yolu.
9. Misafirken mevcut hesaba giriş: (a) temiz kurulum, onboarding ilk slayttan "Zaten hesabım var": uyarı yok, giriş doğrudan; (b) 3 görev ve 2 öğün eklenmiş misafir: uyarı "3 görevin ve 2 öğün kaydın" yazıyor, plan bloğu ve antrenman geçmiyor; (c) aynı misafir uçak modunda girişe basar: sayısız uyarı çıkıyor (giriş de ağ ister, hata giriş formunda). Giriş sonrası misafir görevleri görünmüyor, hesabın görevleri görünüyor, önceki misafirin odak/widget durumu temizlenmiş, Pro görünümü önceki kullanıcıdan taşınmamış.
10. Kalıcı hesap A'dan çıkış, B'ye giriş (Pro ve Pro olmayan): B'de Pro bilgisi A'dan geçmiyor, paywall düğmeleri SDK kimliği B olana kadar pasif.
11. Misafir çıkış: güçlü uyarı, ardından login ekranı; "Misafir olarak devam et" yeni boş misafir açar.
12. Misafir "Tüm verilerimi sil": `delete-account` 200, login ekranı.
13. Sunucu kapısı (deploy edildikten sonra): misafir JWT'siyle ve e-postası onaysız kalıcı kullanıcının JWT'siyle `curl` ile `ai-suggest` 403 `account_required`; `parse-meal` 200 kural katmanı yanıtı, model çağrılmadı.
13b. Şifresiz Google hesabı (canlıdaki 5 hesabın durumu; test için ayrı bir test hesabıyla): mobilde açılınca `ready`, şifre adımı görmüyor.
14. Eski kalıcı kullanıcı (geriye dönük doldurma sonrası) uygulamayı açar: şifre adımı görmez.
15. Uçak modu ile ilk açılış: login + misafir düğmesi, ağ gelince çalışır.
16. Web e-posta değişikliği (şablon değiştikten sonra, kalıcı test hesabıyla `lifeos.tr` ayarlarından): gelen e-posta şablonun değişiklik dalını gösteriyor (yeni adres yazıyor, "E-posta değişikliğini onayla" bağlantısı var), bağlantı değişikliği tamamlıyor.
17. Gizlilik politikası sayfasında "Misafir Kullanım" bölümü yayında (web yayınından sonra `lifeos.tr/gizlilik-kvkk`).

## 16. Yayına alma sırası ((SAHİP) işaretli adımlar sahibin işi)

1. Adım 0 spike'ı yerel Supabase ya da ayrı bir staging projesinde (bölüm 15). Üretim projesinde anonim giriş bu aşamada AÇILMAZ.
2. (SAHİP) Authentication > SMTP Settings'te özel SMTP kurulu mu bakılır (bulgu 17). Kurulu değilse Confirm email açılmadan önce kurulur (ör. Resend SMTP); yerleşik SMTP ekip dışı adreslere göndermez ve saatte birkaç e-postayla sınırlıdır, Confirm email açıkken bu kayıtları durdurur.
3. Sunucu kapıları, web formları ve migration canlıya, dashboard ayarları değişmeden ÖNCE:
   - AI kapısı (bölüm 9) ayrı küçük bir PR ile eklenir ve deploy edilir (`supabase functions deploy ai-suggest parse-meal`, SAHİP ya da sohbetteki onayıyla ajan). Routing değişikliği develop'a girdi (#37), bekleyen bağımlılık yok.
   - Web API rotası kapıları (bölüm 9: `authenticateRequest` + `requirePermanent`) ve web kayıt formlarının onay bekleme durumu (6.6) web yayınıyla canlıya çıkar. Formlar önce çıkmazsa Confirm email açıldığı anda web kaydı oturumsuz `/dashboard`'a gider (bulgu 16).
   - `db push` (SAHİP onayıyla, proje hafızasındaki dry-run önce kuralı): `073_` migration'ı (olay adları, `events` değişikliği, `password_set` doldurma, tetikleyiciler, temizlik fonksiyonu ve cron). Sonra `pnpm db:types` ve tip commit'i. Doldurma bu adımda çalıştığı için mevcut kullanıcılar yeni mobil sürümde şifre adımı görmez.
4. Dashboard (SAHİP), madde 2 ve 3 tamamlandıktan sonra ve yeni mobil build incelemeye gönderilmeden ÖNCE, üçü birlikte: "Confirm email" AÇIK; "Allow anonymous sign-ins" AÇIK; "Allow manual linking" AÇIK. Ayrıca anonim giriş IP sınırı 30/saat KALIR; "Change email address" şablonu 6.5 madde 8'deki Türkçe iki dallı şablonla değiştirilir (konu "LifeOS doğrulama kodun"; misafir dalında kod, değişiklik dalında web için bağlantı; Adım 0 (i) sonucuna göre). `supabase/config.toml` `[auth]` altına eşleşen yerel ayarlar yazılır (`enable_anonymous_sign_ins = true`, `enable_manual_linking = true`, `[auth.email] enable_confirmations = true`) ki yerel ortam canlıyla aynı olsun. Sıranın sebebi: yeni mobil sürüm anonim giriş olmadan kayıt yapamaz (6.4), inceleme ekibi de kayıt dener. Bedeli: bu andan yeni sürüm yayına girene kadar eski mobil sürümde `signUp` sonrası ekranda bir şey olmuyor (bulgu 16); pencere mağaza inceleme süresi kadardır. Adım 0 (h) bu pencerede kullanıcının ne gördüğünü ölçer.
5. Mobil sürüm: yeni EAS build (SAHİP "build al" derse). Anonim giriş anahtarı kill switch'tir: kapatmak yeni açılışları login ekranına döndürür, mevcut misafirler çalışmaya devam eder, ama yeni sürümde mobil kayıt da durur (bölüm 14 madde 2). Sunucu kapıları (madde 3) sürümden önce yayında olduğu için eski/yeni hiçbir mobil sürüm kapıyı atlayamaz.
6. Yayın sonrası ilk hafta: `account_upgraded` / `guest_started` oranı (`analytics.guest_conversion`), `account_gate_shown` dağılımı, 429 sayısı, cron'un ilk koşusunda silinen sayısı (beklenen: ilk 30 günde sıfır). Doğrulamasız yükseltme kontrolü: yeni kalıcı hesaplarda `email_confirmed_at` ile `confirmation_sent_at` ya da `email_change_sent_at` birlikte dolu olmalı; ikisi de boş bir yükseltme, Confirm email'in kapandığını gösterir (6.5 madde 1).

## 17. Kapsam dışı (bilinçli)

- Misafir -> mevcut hesap veri birleştirme (karar a).
- Apple/Google ile giriş ve `linkIdentity` (ayrı iş, şimdilik e-posta).
- CAPTCHA/Turnstile (React Native'de WebView gerektirir; koruma: sunucu kapıları, IP sınırı, 30 gün temizliği).
- Web'de misafir modu (web arayüzü anonim giriş açmaz, `signUp` ile kalır; yalnızca web API rotalarına sunucu kapısı ve kayıt formlarına onay bekleme durumu eklenir). Mobilde `signUp` kalkar (6.4).
- AI faydasını anlatan hatırlatmalar ve paywall/teklif metinlerinin yeniden yazımı (bölüm 8 madde 8): ayrı spec ve iş. Misafir modu yalnızca `post_signup` paywall'ını getirir.
- Cron/service-role fonksiyonlarına (`calendar-sync`, `send-email`, `daily-digest`, `event-notifications`) kapı eklemek: kullanıcı JWT'siyle erişilemiyorlar.
- Misafir için "verilerimi indir".
- Ayarlar ve Profil ayrımı (2026-10-29, sahibin isteği): bugün ayar olması gereken çoğu şey Profil ekranının içinde; bunlar ayrı bir Ayarlar ekranına taşınacak, Ayarlar Profil'in yanında duracak. Ayrı tasarım işi (KALAN_ADIMLAR Faz 7). Misafir modu bu ayrımı beklemez: hesap kartları (6.3, 6.5 madde 4) bugünkü Profil ekranına konur, ayrım yapılınca hesapla ilgili bölümde (Profil tarafında) kalır.
- Misafir kullanım sınırı (ör. en fazla N görev): ilk sürümde yok. Not: anonim hesaplar ücretsiz oluşturulabildiği için yazma suistimali (çok sayıda tek kullanımlık hesapla veri yazmak) mümkün; ilk sürümde yalnızca IP sınırı ve 30 gün temizliği koruyor, gözlemlenirse sonraki sürümde sınır eklenir.

## 18. Sahibin kararları

### 18.1 Rev. 3 (2026-10-28)

Rev. 2'deki altı açık soru ve inceleme sırasında çıkan bir soru sahibin seçimiyle kapandı:

1. Confirm email AÇILIR. Hesabın `ready` olması, AI ve entegrasyonlar onaylı e-posta ister (bölüm 5, 6.5, 9). Sıra: bölüm 16 madde 2 ile 4.
2. Mobilde doğrudan kayıt da misafir yolundan geçer: `signInAnonymously`, ardından `updateUser({ email })`; `signUp` mobilde kalkar (6.4). Kod girilene kadar ücretsiz özellikler açık, AI, Pro ve entegrasyonlar kapalı; IP sınırına sayılır.
3. Anonim giriş IP sınırı 30/saat kalır, 429 görülürse yükseltilir (bölüm 14 madde 3).
4. Hesap açılınca paywall bir kez (`post_signup`, MUST, bölüm 8 madde 7). Ardından dört kanalın hepsiyle sıklık sınırlı AI fayda hatırlatması; ayrıntısı ayrı spec (bölüm 8 madde 8, bölüm 17).
5. Apple Hatırlatıcılar içe aktarması hesap ister (6.2; yalnızca istemci kapısı).
6. `food_gaps` satırları silinen kullanıcıda kimliksiz kalır (032 davranışı, bölüm 12).
7. `events.user_id` `ON DELETE SET NULL` kabul; ayrı sayaç tablosu yok (bölüm 11).

### 18.2 Rev. 4 (2026-10-29, persona kağıt testi sonrası)

Rev. 3 dört personayla kağıt prototipte koşuldu (raporlar `.claude/skills/persona-test/raporlar/2026-10-28-P{5,6,1,2}-misafir.md`, depoda değil): P2 Kerem 9/10 (yeni telefonda eski hesap, 5 adımda tamam, uyarıda duraksadı), P5 Murat 7/10 (bildirim izni uygulamayı görmeden, etiketsiz profil simgesi, gizlilik politikasında 30 gün kuralını varsaydı), P1 Nermin 4/10 (hesap kaydetme yarım: İngilizce e-posta, şifre iki kez, "kaydedildi" demeden paywall), P6 Elif 4/10 (AI kapısı, vazgeçti: hesap açar açmaz paywall, ücretsiz hakkı görmedi, "Confirm Change of Email" konusu). Veri kaybı yaşayan persona yok; dördü de verisinin sunucuda olduğunu doğru söyledi. Sahibin kararları:

8. Paywall zamanı: önce "Hesabın kaydedildi" onayı. AI kapısından gelende paywall ilk ücretsiz AI sonucundan sonra ve kalan hakla; diğerlerinde onaydan sonra. "Bir kez, MUST" aynen (8.7).
9. Mevcut hesaba giriş uyarısı yalnızca misafirin verisi varken ve sayıyla; veri yoksa doğrudan giriş, sayım başarısızsa sayısız uyarı (bölüm 7).
10. Yedekleme hatırlatması yalnızca Profil'de; Bugün'de banner ya da kart yok (UX.md:83). Bugün'deki profil düğmesi herkes için "Profil" yazısı ve erişilebilirlik etiketi alır (6.3).
11. "Change email address" şablonu Türkçe ve iki dallı: misafir yükseltmesinde yalnızca kod, web değişikliğinde bağlantı (6.5 madde 8, bölüm 16 madde 4).
12. Şifre kendiliğinden: kayıt formundaki şifre kod doğrulanınca otomatik kaydedilir; şifre adımı yalnızca bellek kaybolursa ya da çağrı hata verirse çıkar (6.5 madde 3).
13. Gizlilik politikasına misafir bölümü (bölüm 11), misafir modu canlıya çıkmadan önce.
14. Bildirim izni bağlamda: ilk zaman bloğu kaydedilince ya da bildirim ayarında; onboarding sonunda istenmez (bölüm 4 ve 10).
15. Ayarlar ve Profil ayrımı ayrı tasarım işi; bu spec'in kapsamı dışında (bölüm 17).

Spec'i yazarken verilen, sahibin geri alabileceği ara kararlar: sayıma `workouts` da girer (kayıp riski olan her kullanıcı verisi sayılsın diye); "Şifreni belirle" kartı da UX.md:83 yüzünden Bugün'den Profil'e taşındı; AI kapısından gelen kullanıcı AI'ya basmazsa paywall bir sonraki AI sonucunu bekler; `integration` nedeni AI dışı nedenlerle aynı sırayı izler.
