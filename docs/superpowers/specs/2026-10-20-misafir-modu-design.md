# Misafir modu (mobil) tasarımı

Tarih: 2026-10-20. Kapsam: yalnızca `apps/mobile`, `supabase/` (migration, iki edge function) ve `packages/shared` içinde küçük bir olay adı eklemesi. Web uygulaması değişmez (web anonim girişi açmıyor, kapı mobilde ve edge function'larda).

Bu belge kod değil, tasarımdır. Satır numaraları `origin/develop` üzerinde okunan koda göre verilmiştir.

## 1. Amaç ve başarı ölçütleri

Sorun: uygulama ilk açılışta giriş/kayıt zorluyor (`apps/mobile/app/_layout.tsx:97-100`, oturum yoksa `/(auth)/login`). Kullanıcı değeri görmeden hesap açmak zorunda, ilk gün düşüşü buradan geliyor. Deneyimli bir geliştirici arkadaşın geri bildirimi de bu yönde.

Hedef: kullanıcı hesap açmadan görev, planlama, beslenme kaydı ve antrenmanı kullanır. Hesap yalnızca gerçekten gerektiği anda istenir.

Başarı ölçütleri:
1. Yeni kurulum, hiçbir giriş ekranı görmeden ilk görevi ekleyebiliyor (emülatörde elle doğrulanır).
2. Misafir hesap açınca veri kaybı sıfır: aynı `uid`, tüm satırlar yerinde.
3. Misafir hiçbir koşulda RevenueCat'e `logIn` olmaz, AI edge function'larında model çağrısı yapamaz.
4. Ölçüm: yeni kurulumdan ilk görev eklemeye oran (mevcut `analytics.user_funnel` ile), misafirden hesaba dönüşüm oranı (`guest_upgraded` / misafir sayısı). Hedef sayı bu belgede verilmiyor, ilk iki haftanın verisi çıkınca konur.

## 2. Onaylanmış kararlar (yeniden açılmıyor)

- Mekanizma: `supabase.auth.signInAnonymously()`. Misafir gerçek bir `auth.users` satırı, `auth.uid() = user_id` RLS'i ve tüm tablolar değişmez. Veri taşıma yok.
- Yükseltme: kayıt ekranı `signUp` yerine misafir kullanıcıda `updateUser({ email, password })` çağırır, `uid` korunur.
- Misafir MEVCUT bir hesaba giriş yaparsa misafir verisi geride kalır (seçenek a), önceden net uyarı verilir. Birleştirme fonksiyonu yok.
- Hesap gerektiren anlar: satın alma/paywall, AI özellikleri, entegrasyonlar (Google Takvim, Todoist). Ayrıca ayarlarda ve veri girişinden sonra yedekleme hatırlatma kartı.
- Görev, planlama, beslenme kaydı, antrenman hesapsız çalışır.
- Temizlik: 30+ gün etkin olmayan anonim kullanıcıları haftalık cron siler.
- Dashboard'da "Allow anonymous sign-ins" açılır (sahibi yapar).

## 3. Koddan çıkan bulgular (tasarımı şekillendiren)

1. Tüm AI düğmeleri tek yerden geçiyor: `useProGate().requirePro` (`apps/mobile/src/hooks/useProGate.ts:11`). Çağrı yerleri (8 adet): `app/task/[id].tsx:111`, `app/(tabs)/planning.tsx:107`, `app/(tabs)/workout.tsx:198`, `app/(tabs)/nutrition.tsx:578` ve `:663`, `src/hooks/useWorkoutCoach.ts:81`, `src/components/tasks/BrainDumpSheet.tsx:126`, `src/components/report/useDayReport.ts:20`. Tek kapı olduğu için mobil tarafı küçük kalır.
2. Ücretsiz kullanıcıya ömür boyu 3 AI plan hakkı veriliyor (`supabase/functions/_shared/ai/usage.ts:128`, `ai_allowance`). Anonim giriş serbest olunca her yeni misafir 3 hak daha demek: sunucu kapısı olmadan maliyet sızıntısı. Bu yüzden sunucu kapısı zorunlu, ve misafir bu ücretsiz haklardan da yararlanmaz (bkz. bölüm 9).
3. `daily-report` edge function'ı model çağırmıyor (içinde Anthropic/`resolveAiAccess` yok), misafire açık kalır. AI'lı anlatı kısmı `ai-suggest` `daily_report` rotasından geliyor (`packages/shared/src/supabase/reports.ts:61`) ve kapıdan geçer.
4. `parse-meal` free katmanda kural katmanıyla çalışıyor ve "öğün kaydı hiçbir koşulda durmaz" ilkesini taşıyor (`supabase/functions/parse-meal/index.ts:135-141`). Misafire 403 verilmez, model katmanı kapalı kalır.
5. `events` tablosunda `events_name_check` kısıtı var, yeni olay adı migration ister (`supabase/migrations/040_events.sql:43`). Aynı dosyada `analytics.user_funnel` "register" adımını `user_profiles.created_at` olarak tanımlıyor (`040_events.sql:12`). Misafirler de `user_profiles` satırı alacağı için kayıt sayısını şişirir, huni bozulur. Bkz. bölüm 11.
6. `handle_new_user` trigger'ı (`014_fix_signup_triggers.sql:9-24`) anonim kullanıcı yaratılınca da çalışır ve `display_name` boş, `timezone` `raw_user_meta_data`'dan ya da `Europe/Istanbul` ile `user_profiles` satırı açar. Yükseltmede trigger tekrar çalışmaz, isim ayrıca yazılmalı. Bkz. bölüm 6.4.
7. `_layout.tsx` oturum değişimlerinde yerel durumu yalnızca `SIGNED_OUT` olayında sıfırlıyor (`:69-77`). Misafirden mevcut hesaba `signInWithPassword` ile geçişte `SIGNED_OUT` gelmez, `SIGNED_IN` gelir. Sıfırlama bu durumda da çalışmalı. Bkz. bölüm 7.
8. `_layout.tsx:55` her oturumda `initRevenueCat(s.user.id)` çağırıyor. `SubscriptionContext` `isPro`'yu "Supabase satırı VEYA RevenueCat hakkı" olarak hesaplıyor (`:179`) ve RevenueCat'ten okuyor (`purchases.ts:44`). Çıkışta `Purchases.logOut` çağrısı yok, yani kalıcı kullanıcı çıkıp misafir başlarsa `storePro` eski kullanıcının hakkını taşıyabilir. Bkz. bölüm 8.
9. `registerForPushNotificationsAsync` her oturumda hemen çağrılıyor ve izin penceresini açıyor (`_layout.tsx:54`, `notifications/setup.ts:100-103`). Misafirde bu, değer görmeden izin isteği demek. Bkz. bölüm 10.
10. `supabase/config.toml` `[auth]` altında anonim giriş ve manuel bağlama ayarı yok (`:15-25`). `@supabase/supabase-js` `^2.47.2`, `User.is_anonymous` tipi mevcut.
11. Supabase dokümanı: anonim kullanıcı `authenticated` rolünü kullanır, JWT'de `is_anonymous` claim'i var; e-posta ile kalıcıya çevirmek için "manual linking" açık olmalı, e-posta doğrulanır, sonra şifre aynı şekilde `updateUser` ile verilir; anonim giriş için IP başına varsayılan 30 istek/saat sınırı var; otomatik temizlik yok. Kaynak: https://supabase.com/docs/guides/auth/auth-anonymous

## 4. Yeni ilk açılış akışı

```
Uygulama açılır
  INITIAL_SESSION var ->  hasSeenOnboarding?  evet: /(tabs)/today   hayır: /onboarding   (mevcut davranış)
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
  - Onboarding bitişindeki zorunlu paywall (`:54-56`) misafirde atlanır. Değer görmemiş misafire ödeme duvarı çıkarmak hedefle çelişir. Deneme teklifi hesap açıldıktan sonra gösterilir (bkz. bölüm 8, madde 5).
  - İlk slayta küçük bir "Zaten hesabım var" bağlantısı (login ekranına). Yeniden kurulumda geri dönen kullanıcı için tek çıkış yolu bu.
- Bildirim izni: misafirde `registerForPushNotificationsAsync` uygulama başlarken izin PENCERESİ açmaz. Mevcut izin zaten verilmişse token sessizce kaydedilir; verilmemişse izin istemi onboarding `finish()` sonunda, ya da kullanıcı bildirim ayarını açtığında yapılır. Fonksiyona `{ prompt: boolean }` seçeneği eklenir (bkz. bölüm 10).

## 5. Oturum durumu modeli

Mevcut durum: `_layout.tsx` kendi `session` state'ini tutuyor, `SubscriptionContext` ayrı bir `onAuthStateChange` dinleyicisiyle `userId` tutuyor, ekranlar tek tek `supabase.auth.getUser()` çağırıyor. `is_anonymous` için üçüncü bir kopya açılmaz.

Yeni: `apps/mobile/src/contexts/AuthContext.tsx`, `SubscriptionProvider`'ın üstünde (`_layout.tsx:132-140`).

```ts
interface AuthState {
  session: Session | null
  userId: string | null
  isAnonymous: boolean   // session.user.is_anonymous === true
  isReady: boolean       // INITIAL_SESSION geldi
}
export function useAuth(): AuthState
```

- Kaynak `session.user.is_anonymous` (oturumla birlikte gelir, ağ gerektirmez). `undefined` kalıcı sayılır (`=== true` ile okunur): eski oturumlar kalıcı kullanıcıdır.
- `_layout.tsx` kendi `session` state'ini bırakıp `useAuth()` kullanır; yan etkiler (push, RevenueCat, odak kalıcılığı, çıkış temizliği) `_layout`'ta kalır. `SubscriptionContext` `userId` ve `isAnonymous`'ı `useAuth()`'tan alır, kendi dinleyicisini bırakır.
- Sunucu tarafı `is_anonymous`'ı asla istemciden almaz, `auth.getUser()` yanıtından okur.
- Yükseltme anında `USER_UPDATED` olayı gelir ve `isAnonymous` kendiliğinden `false` olur (e-posta doğrulandıysa). E-posta doğrulanana kadar `isAnonymous` `true` kalır (bkz. bölüm 6.5, bekleyen durum).
- Başka cihazda/tarayıcıda doğrulama yapılırsa yerel oturum eskidir. Bekleyen durumdayken `AppState` `active` olunca ve "Onayladım" düğmesinde `supabase.auth.refreshSession()` çağrılır.

## 6. Tek "hesap gerekli" kapısı

### 6.1 API

```ts
// apps/mobile/src/hooks/useRequireAccount.ts
type AccountReason = 'paywall' | 'ai' | 'integration' | 'backup' | 'login_switch'
function useRequireAccount(): { isAnonymous: boolean; requireAccount(reason: AccountReason): boolean }
```

- `requireAccount` misafir değilse `true` döner. Misafirse `false` döner ve hesap kapısı modal'ını açar; `account_gate_shown` olayı yazılır.
- Kapı bir rota: `app/account-gate.tsx` (modal, `reason` parametresi). Başlık ve gövde `reason`'a göre değişir, üç düğme: "Hesap oluştur" (`/(auth)/register`, yükseltme modu), "Zaten hesabım var" (login, uyarılı, bkz. bölüm 7), "Şimdi değil".
- `useProGate.requirePro` içine, `isLoading` ve `isPro` kontrollerinden ÖNCE `if (isAnonymous) return requireAccount('ai')` eklenir. Böylece bulgu 1'deki sekiz çağrı yeri değişmeden misafiri yakalar. Paywall yönlendirmesi (`'free_limit'` dahil) misafirde hiç açılmaz.
- Kapı, hesap açma tamamlanınca (`isAnonymous` false) kullanıcıyı geldiği ekrana geri döndürür: `router.back()`; çağıran taraf aksiyonu otomatik tekrarlamaz, kullanıcı düğmeye yeniden basar (YAGNI).

### 6.2 Çağrı yerleri (tam liste)

| Yer | Dosya | Davranış |
|---|---|---|
| Tüm AI düğmeleri | `useProGate.ts:11` (8 çağrı yeri, bulgu 1) | `requireAccount('ai')` |
| Profil: üyelik satırı | `app/(tabs)/profile.tsx:343-345` (`/paywall`) | misafirde `requireAccount('paywall')` |
| Paywall rotası (savunma) | `app/paywall.tsx`, ekran açılışı | misafir doğrudan açarsa (derin bağlantı, eski yığın) `router.replace` ile kapıya yönlendir, planlar yüklenmez |
| Entegrasyonlar | `src/components/settings/IntegrationsLink.tsx:15` ve `app/(tabs)/settings/integrations.tsx` | Google Takvim bağlama ve Todoist içe aktarma eylemlerinde `requireAccount('integration')`. Apple Hatırlatıcılar içe aktarması yerel olduğu için serbest kalır (açık soru 4) |
| Entegrasyon sağlayıcı rotası | `app/integrations/[provider].tsx` | açılışta aynı koruma |
| Yedekleme hatırlatması | profil ekranında kart + Bugün ekranında banner (6.3) | düğme `register`'a gider |

### 6.3 Yedekleme hatırlatma kartı

- Profilde misafire her zaman görünür: "Hesabını kaydet, verilerin kaybolmasın" + "30 gün hiç açmazsan misafir verilerin silinir."
- Bugün ekranında kapatılabilir banner: misafir VE (en az 3 görev ya da ilk öğün/antrenman kaydı VAR) ise gösterilir. Kapatılırsa 7 gün susar (`AsyncStorage`, anahtar kullanıcıya bağlı). Sayım için mevcut yüklü store'lar kullanılır, yeni sorgu yok.
- Kart misafir değilse hiç render edilmez.

### 6.4 Kayıt ekranı (`app/(auth)/register.tsx`) değişiklikleri

Mod, `useAuth().isAnonymous`'a göre belirlenir.

- Yükseltme modu (misafir): `signUp` (`:26`) yerine `supabase.auth.updateUser({ email, password, data: { display_name, timezone } })`. Başlık "Hesabını kaydet", alt metin "Verilerin bu hesaba bağlanır." Şifre alanında "En az 8 karakter" ipucu var (`:64`) ama doğrulama yok: yükseltmede min 8 karakter kontrolü eklenir.
- Normal mod (oturum yok, login'den gelen): bugünkü `signUp` davranışı aynen kalır.
- `user_profiles` yazımı: `updateUser`'ın `data` alanı yalnızca `raw_user_meta_data`'yı değiştirir; `handle_new_user` yeniden çalışmaz. Bu yüzden başarıdan sonra `user_profiles.update({ display_name })` (`profiles_update` politikası kullanıcıya izin veriyor, `014:60-63`) çağrılır. Saat dilimi `notification_preferences.timezone`'a `syncTimezone` ile zaten yazılıyor (`setup.ts:26-48`).
- E-posta zaten kayıtlıysa `updateUser` hata döner: ekranda "Bu e-posta kayıtlı. Giriş yaparsan misafir verilerin geride kalır" metni ve "Giriş yap" düğmesi (bölüm 7'deki uyarı akışına gider). Hata kodu eşleşmesi emülatörde doğrulanacak (bkz. bölüm 15, Adım 0).

### 6.5 E-posta onayı ve "bekleyen" durum

Bilinmeyen: üretimde "Confirm email" açık mı. `config.toml` `enable_confirmations = false` (`:25`) yalnızca yerel geliştirme. Tasarım iki duruma da dayanıklı, ayara bağımlı değil:

1. `updateUser` yanıtındaki `data.user` okunur:
   - `user.email === girilenEposta` ve `is_anonymous` false: hesap hemen kalıcı oldu (otomatik onay açık). Kapı kapanır, başarı mesajı.
   - `user.new_email === girilenEposta` (ya da `is_anonymous` hâlâ true): onay bekleniyor, bekleyen ekrana geç.
2. Bekleyen ekran (aynı rota, ikinci adım): "E-postana gelen 6 haneli kodu gir". Kod `supabase.auth.verifyOtp({ email, token, type: 'email_change' })` ile doğrulanır. Bağlantı yerine kod seçildi çünkü `_layout.tsx` yalnızca `reset-password` derin bağlantısını işliyor (`:38`); onay bağlantısı için yeni derin bağlantı işleyicisi yazmaktan kaçınıyoruz. "Kodu tekrar gönder" 60 sn bekleme ile (login'deki `RESET_COOLDOWN_SECONDS` kalıbı, `login.tsx:14`).
3. Bekleyen sürede misafir kullanım kesilmez: uygulama normal çalışır, profil kartı "E-posta onayı bekleniyor" gösterir. Bu sürede hâlâ misafir sayılır; paywall ve AI kapıları kapalı kalır. Bekleyen e-posta `AsyncStorage`'a (kullanıcıya bağlı) yazılır ki uygulama kapanıp açılınca onay ekranı yeniden açılabilsin.
4. Şifre zamanı: Supabase'in dokümanlanmış akışı iki adım (önce e-posta, doğrulanınca şifre `updateUser`). Onaylı karar tek çağrı (`{ email, password }`). Tek çağrının şifreyi ve bekleyen e-postayı birlikte kabul ettiği Adım 0'da (bölüm 15) doğrulanır. Kabul etmezse yedek akış: `updateUser({ email })`, kod, sonra `updateUser({ password })`; kullanıcı için ek ekran yok, ikinci adım kod ekranının devamı.
5. Sahibin yapacağı: dashboard'da "Change email address" şablonu `{{ .Token }}` içermeli (Authentication > Email Templates). Varsayılan şablon yalnızca bağlantı içerir.

## 7. Giriş ekranı değişiklikleri (misafir mevcut hesaba giriyor)

- Login ekranı oturum yokken olduğu gibi çalışır, artık oturum açıkken de (misafir) açılabilir: (a) kapıdaki "Zaten hesabım var", (b) onboarding ilk slayt bağlantısı, (c) kayıt ekranında e-posta çakışması.
- Misafir oturumdayken `signInWithPassword` çağrısından ÖNCE, misafirin verisi varsa uyarı:

  "Bu cihazdaki misafir verilerin hesabına taşınmaz ve kaybolur. Devam edersen yalnızca hesabındaki veriler görünür."  Düğmeler: "Vazgeç", "Giriş yap, misafir verisini bırak".

- "Misafirin verisi var mı" için `guestHasData(userId)`: `tasks`, `meals`, `workouts` tablolarında `select('id', { count: 'exact', head: true }).limit(1)`, herhangi biri >0. Boşsa uyarı çıkmaz (ilk slayttan "Zaten hesabım var" diyen kullanıcı veri yokken uyarı görmesin).
- Başarılı girişten önce `unregisterPushTokenAsync()` (misafirin token satırı bu cihazdan kopar, `setup.ts:189`). Eski misafir kullanıcı satırı geride kalır, temizlik cron'u siler (bkz. bölüm 12). Hemen silmeye çalışılmaz (YAGNI, ve silme yetkisi istemcide yok).
- `_layout.tsx` yerel durum sıfırlaması bir fonksiyona çıkarılır (`resetLocalUserState()`, `:70-76` içeriği) ve iki durumda çağrılır: `SIGNED_OUT` ve kullanıcı `id`'si değişen `SIGNED_IN`. `focusPersist` zaten `userId` değişimini izliyor (`:57-65`). Görev/beslenme/planlama store'larının kullanıcı değişince yeniden çekildiği implementer tarafından doğrulanır (bugün kalıcı hesaplar arası geçişte de aynı yol).

## 8. RevenueCat kimlik kuralları

Kural: `Purchases.logIn(userId)` yalnızca kalıcı kullanıcı için çağrılır. RevenueCat, `logIn` çağrılmadığında kendi anonim kimliğini kullanır; webhook bunu zaten yok sayıyor (`supabase/functions/revenuecat-webhook/index.ts:98-104`, `app_user_id` Supabase kullanıcısı değilse atlanır).

1. `_layout.tsx:55`: `if (!s.user.is_anonymous) void initRevenueCat(s.user.id)`. Misafirde RevenueCat'e hiç dokunulmaz (`configure` bile çağrılmaz).
2. Yükseltme: e-posta doğrulanıp `USER_UPDATED` ile `is_anonymous` false olunca aynı kanca `initRevenueCat(uid)` çalıştırır. `revenueCatUserId !== userId` kontrolü (`purchases.ts:32`) tekrarı önler. Aynı `uid` olduğu için ek bir kimlik birleştirme yok.
3. `SubscriptionContext`: misafirde `refresh` mağaza sorgusunu (`refreshStore`) atlar ve durumu `FREE_STATE` yapar. `isPro = !isAnonymous && (state.isPro || storePro)` (`:179`). Gerekçe: kalıcı kullanıcı çıkıp misafir başlarsa eski RevenueCat hakkı misafire Pro göstermesin.
4. Çıkışta (`SIGNED_OUT`) `purchases.ts`'e küçük bir `resetRevenueCat()` eklenir: `revenueCatUserId = null` ve yapılandırılmışsa `Purchases.logOut()` (hata yutulur; RevenueCat anonim kullanıcıda `logOut` hata verir). Böylece sonraki misafir önceki kullanıcının kimliğini taşımaz.
5. Paywall: misafirde açılmaz (6.2). Satın alma yalnızca kalıcı kullanıcıdan başlar. Hesap açıldıktan sonra deneme teklifi: kayıt başarılı olunca bir kez paywall (`source: 'post_signup'`) açılması SHOULD, ilk sürümde zorunlu değil (açık soru 3).
6. "Satın alımları geri yükle" (`paywall.tsx` `handleRestore`) misafirde erişilemez (paywall açılmıyor); kalıcı hesapta çalışır.

## 9. AI sunucu kapısı

Not: `feature/ai-model-routing` dalı `ai-suggest` ve `parse-meal`'ı yeniden yazıyor. Bu bölüm küçük bir ek olarak o dal develop'a girdikten SONRA uygulanır; mobil kapı buna bağlı değildir (6.1).

- `ai-suggest/index.ts`: `auth.getUser()` sonrası (`:55`), `resolveAiAccess`'ten ÖNCE (`:62`):
  `if (user.is_anonymous) return json({ error: 'Account required', code: 'account_required' }, 403)`.
  `resolveAiAccess` imzası değişmez; misafirin ücretsiz 3 plan hakkına erişmesi bu satırla kapanır.
- `parse-meal/index.ts`: `getUser()` sonrası (`:105`) 403 DÖNME. `pro` hesabını şuna çevir: `const pro = !user.is_anonymous && access.tier !== 'free'` (`:139`). Misafirde model katmanı kapalı, kural katmanı çalışır, öğün kaydı durmaz. `resolveAiAccess` çağrısı yine yapılır ya da misafirde atlanır, implementer'ın seçimi.
- `daily-report`: değişmez (model çağırmıyor).
- Mobil `callAiSuggest` (`apps/mobile/src/lib/ai.ts:55-57`) 402 ve 403'ü `pro_required` olarak eşliyor. 403 gövdesindeki `code === 'account_required'` ayrıştırılır ve `AiAccessError`'a yeni bir kod eklenir: `'account_required'`. Böylece `planning.tsx:259` misafirde paywall açmaz, kapıyı açar. Bu mobil değişiklik bağımsızdır ve sunucu kapısından önce de güvenle yayınlanabilir.
- `shared/supabase/reports.ts:61` ve `lifeSetup.ts:35` `supabase.functions.invoke` kullanıyor ve hata alırsa fırlatıyor; çağıran ekranlar zaten `requirePro` arkasında, ek işlem yok.

## 10. Bildirimler (misafir)

- Misafir bildirim alır: `daily-digest` ve `event-notifications` `push_tokens`'tan okuyor, misafirin görev/blokları var; sunucu tarafında değişiklik yok. `notification_preferences` satırı `create_default_notification_preferences` trigger'ıyla açılıyor (`019:61-73`), misafir için de oluşur.
- Değişiklik yalnızca istemcide: `registerForPushNotificationsAsync({ prompt })` (`setup.ts:83`). `prompt: false` iken yalnızca `getPermissionsAsync` bakılır, izin yoksa sessizce `null` döner. `_layout.tsx:54` misafirde `prompt: false` çağırır; onboarding `finish()` ve bildirim ayarı ekranı `prompt: true`. Kalıcı kullanıcı davranışı aynen kalır.
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

Analitik:
- Migration: `events_name_check`'e iki ad eklenir: `account_gate_shown` (props: `reason`), `guest_upgraded` (props: `reason`, kapıdan mı profil kartından mı gelindi). `packages/shared/src/supabase/events.ts:19` `EventName` birliğine aynı iki ad. "Misafir başladı" olayı yazılmaz: `auth.users.is_anonymous` ve `created_at` zaten kaynak (aynı olguyu iki yere yazmama ilkesi, 040 başlığı).
- `analytics.user_funnel` ve türevleri: "register" artık `user_profiles.created_at` değil, kalıcı olma anı olarak yeniden tanımlanır (`auth.users.is_anonymous = false` olan kullanıcılar; yükseltilenler için yükseltme zamanı); ayrıca misafir sayısı ayrı sütun olur. Kural: "kayıt = kalıcı hesap". Görünümlerin yeniden yazımı implementer işi; migration sırasında `040` ve sonraki migration'lardaki view tanımları okunup etkilenenler listelenir.
- `paywall_view` olayı için misafir bağlamı gerekmiyor (misafir paywall'ı görmüyor).

## 12. Temizlik cron'u ve CASCADE doğrulaması

Yeni migration (`070_` ya da o gün boş olan sıradaki numara; paralel oturum çakışmasına dikkat, bkz. proje hafızası "migration-number-collisions"). pg_cron doğrudan SQL çalıştırır, `net.http_post` ve gömülü anahtar gerekmez.

```sql
SELECT cron.schedule('purge-stale-guests', '30 3 * * 1', $$
  DELETE FROM auth.users
  WHERE id IN (
    SELECT u.id FROM auth.users u
    WHERE u.is_anonymous
      AND GREATEST(
            u.created_at,
            COALESCE(u.last_sign_in_at, u.created_at),
            COALESCE((SELECT MAX(COALESCE(s.refreshed_at, s.updated_at, s.created_at))
                      FROM auth.sessions s WHERE s.user_id = u.id), u.created_at)
          ) < NOW() - INTERVAL '30 days'
    LIMIT 1000
  );
$$);
```

- Neden `last_sign_in_at` tek başına yetmez: token yenilemesi bu sütunu güncellemiyor; her gün kullanan bir misafir 30 gün sonra silinirdi. Etkinlik işareti `auth.sessions` yenileme zamanı (uygulama açıkken en az saatlik yenileniyor, `jwt_expiry = 3600`, `config.toml:19`). Sütun adları (`refreshed_at`, `updated_at`) canlı şemada doğrulanmalı (yerel PostgreSQL 18 katalog kopyası yöntemi, proje hafızası "Yerel migration testi").
- Cron'un `auth.users`'tan silme yetkisi (job sahibi rol) yerelde denenir.
- Misafir hiç ödeme yapamadığı için (kapı) abonelik riski yok.

CASCADE doğrulaması (migration dosyaları tarandı): kullanıcıya bağlı tüm tablolar `auth.users(id) ON DELETE CASCADE`: `user_profiles`, `tasks`, `time_blocks`, `daily_plans` (001); `nutrition_targets`, `meals`, `food_items` (002); `workouts` (005); `subscriptions`, `payment_history` (013); `workout_programs` (016); `notification_preferences`, `push_tokens` (019); `health_daily`, `health_settings` (028); `api_keys` (029); `notification_log` (031); `food_aliases`, `portion_memory` (032); `nutrition_feedback` (033); `events` (040); `weight_logs` (049); `calendar_feeds` (050); `routines`, `routine_exceptions`, `routine_completions` (054); `integrations` (056); `oauth_states`, `calendar_sync_outbox`, `calendar_busy` (057); `goals` (059); `focus_sessions` (060); `daily_reports` (065); `goal_entries` (066). Alt tablolar (`task_details`, `workout_sets`, `program_days`, `program_exercises`) üst satır üzerinden zincirleme silinir.

CASCADE OLMAYAN tek istisna: `food_gaps.user_id` `ON DELETE SET NULL` (`032_nutrition_resolution.sql:93`). Silinen misafirin çözülemeyen yiyecek ifadeleri `user_id = NULL` ile kalır; küratörlük kuyruğu olduğu için bilinçli olabilir, ama ifade serbest metin (açık soru 5). Depolama (`storage`) kullanılmıyor (mobil, shared ve migration'larda `storage.from` yok). Başka FK'siz `user_id` kolonu bulunamadı; implementer migration sırasında `information_schema` ile canlı şemada bir kez daha doğrular.

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
| `upgrade_email_taken` | Bu e-posta kayıtlı. Giriş yaparsan misafir verilerin geride kalır. | This email is registered. Signing in leaves your guest data behind. |
| `switch_warn_title` | Misafir verisi kaybolacak | Guest data will be lost |
| `switch_warn_body` | Bu cihazdaki misafir verilerin hesabına taşınmaz. Devam edersen yalnızca hesabındaki veriler görünür. | Your guest data won't move to your account. If you continue you'll only see your account's data. |
| `switch_warn_confirm` | Giriş yap, misafir verisini bırak | Sign in, leave guest data |
| `guest_signout_title` | Çıkış yaparsan veriler kaybolur | Signing out erases your data |
| `guest_signout_body` | Misafir verilerin yalnızca bu oturumda. Çıkış geri alınamaz. | Guest data lives only in this session. Signing out can't be undone. |
| `guest_signout_confirm` | Yine de çık | Sign out anyway |
| `guest_delete_title` | Tüm verilerimi sil | Delete all my data |
| `guest_badge` | Misafir | Guest |

`register.tsx` ve `login.tsx` bugün `t.*` yerine sabit string kullanıyor (`'Kayıt Ol'`, `'Giriş Yap'`); yükseltme moduna eklenen yeni metinler `t.*` ile yazılır, eski sabitler bu iş kapsamında taşınmaz.

## 14. Kenar durumlar

1. Çevrimdışı ilk açılış: `signInAnonymously` başarısız, login ekranı + "Misafir olarak devam et" yeniden dener. Ağ gelince çalışır; ek kuyruk yok.
2. Anonim girişin kapalı olması (dashboard anahtarı kapalı): aynı hata yolu, uygulama bugünkü gibi login ekranına düşer. Anahtar aynı zamanda kill switch olarak kullanılır (bölüm 16).
3. IP başına 30/saat sınırı: operatör CGNAT arkasında çok kullanıcı aynı IP'yi paylaşabilir. Aşılırsa 429, hata yolu 1 ile aynı. Sahibin dashboard'dan sınırı yükseltmesi önerilir (açık soru 1).
4. Yeniden kurulum: oturum `SecureStore`'da; Android'de kurulumla silinir, misafir verisine erişim kaybolur (yeni misafir). iOS Keychain kurulum sonrası oturumu koruyabilir (platform davranışı; oturum varsa 4. bölümdeki ilk dal zaten devreye girer). Bu sınırlama yedekleme kartının varlık nedeni; ek çözüm yok.
5. Odak durumu ve widget anlık görüntüsü kullanıcıya bağlı anahtarlarla tutuluyor (`persistFocus(AsyncStorage, userId)`, `_layout.tsx:62`); yükseltmede `uid` aynı kaldığı için bir şey kaybolmaz. Mevcut hesaba geçişte bölüm 7'deki sıfırlama çalışır.
6. Yükseltme sırasında `user.email` hâlâ null olabilir (bekleyen durum): profil e-posta alanı boş, rozet "Misafir".
7. Yükseltme sırasında uygulama kapanırsa: `updateUser` sunucuda tamamlandıysa bekleyen e-posta `AsyncStorage`'tan okunur (6.5, madde 3); tamamlanmadıysa kullanıcı kayıt ekranını yeniden açar.
8. Misafir tek cihazlı (kasıtlı). Aynı hesapla ikinci cihazda giriş normal akış.
9. Misafir sayısı büyürse `auth.users` şişer: cron haftalık, LIMIT 1000 ile partiler halinde siler; birikme olursa sonraki hafta devam eder.
10. Web: `lifeos.tr` anonim giriş açmıyor, ekran/kod değişikliği yok. Mobil misafir web'de giriş yapamaz (şifresi yok), beklenen.

## 15. Test planı

Birim (projedeki mevcut test yapısına göre):
- `useRequireAccount`: misafirde `false` + kapı rotasına gider + olay yazar; kalıcıda `true`.
- `useProGate.requirePro`: misafirde paywall değil kapı; kalıcı free'de paywall; Pro'da `true`.
- RevenueCat kancası: `is_anonymous` true iken `initRevenueCat` çağrılmıyor (koşul saf fonksiyona çıkarılırsa test edilir).
- `SubscriptionContext` türetimi: misafirde `isPro` false, `storePro` true olsa bile.
- `bootstrapGuest`: tek sefer çalışır; `lifeos_had_session` varsa çağrılmaz.
- `guestHasData`: boş/dolu.
- `callAiSuggest`: 403 + `account_required` -> `AiAccessError('account_required')`; 402 -> `pro_required`.
- Edge function (Deno yok, bkz. proje hafızası "edge-function-typecheck-gap"): scratchpad `tsc` ile tip kontrolü; kapı mantığı saf fonksiyona (`isAiBlockedForGuest(user)`) çıkarılırsa node ile birim testlenir.
- Migration: yerel PostgreSQL 18 + canlı şema katalog kopyası; test misafirini 31 gün önceye tarihleyip cron SQL'ini elle çalıştır, satır ve alt tablo CASCADE'ini, `food_gaps` istisnasını doğrula. 29 gün önce tarihli misafir silinmemeli; 31 gün önce oluşmuş ama `sessions` kaydı yeni olan misafir silinmemeli.

Emülatör adımları (`windows-local-android-build` yöntemi):
0. Adım 0 (spike, kod yazmadan önce, yaklaşık 30 dk): geçici bir ekranda `signInAnonymously`, sonra `updateUser({ email, password })`. Doğrula: (a) şifre ve bekleyen e-posta tek çağrıda kabul ediliyor mu, (b) bekleyen durumda `is_anonymous`, `email`, `new_email` değerleri, (c) `verifyOtp type:'email_change'` ile `is_anonymous` false oluyor mu, (d) JWT claim'inin yenilenmesi için `refreshSession` gerekiyor mu, (e) kayıtlı e-postada hata kodu/mesajı. Sonuca göre 6.4 ve 6.5 kesinleşir.
1. Temiz kurulum, hesap yok: giriş ekranı görünmeden onboarding açılır. Görev ekle, öğün kaydet, antrenman başlat.
2. Bildirim izin penceresi onboarding sonuna kadar açılmaz.
3. Her AI düğmesine bas (8 çağrı yeri): hepsi hesap kapısı açar, paywall açılmaz. Profil üyelik satırı kapıyı açar. `adb` ile `paywall` rotasını derin bağlantıyla aç: kapıya yönlenir.
4. Entegrasyonlar: Google/Todoist eylemi kapı açar; Apple Hatırlatıcılar içe aktarma çalışır.
5. Yedekleme kartı profilde var; Bugün'de 3. görevden sonra banner çıkar, kapatınca 7 gün susar.
6. Yükseltme: e-posta + şifre, kod ekranı, kod gir. Görevler yerinde, `uid` aynı, "Misafir" rozeti kayboldu, RevenueCat `logIn` o anda bir kez çalıştı (log). Paywall artık açılıyor.
7. Aynı akışta uygulamayı kod ekranındayken öldür/aç: bekleyen ekran geri geliyor.
8. Kayıtlı e-posta ile yükseltme dene: çakışma mesajı ve uyarılı giriş yolu.
9. Misafirken mevcut hesaba giriş: veri varsa uyarı, yoksa uyarı yok. Giriş sonrası misafir görevleri görünmüyor, hesabın görevleri görünüyor, önceki misafirin odak/widget durumu temizlenmiş.
10. Misafir çıkış: güçlü uyarı, ardından login ekranı; "Misafir olarak devam et" yeni boş misafir açar.
11. Misafir "Tüm verilerimi sil": `delete-account` 200, login ekranı.
12. Sunucu kapısı (deploy edildikten sonra): misafir JWT'siyle `curl` ile `ai-suggest` 403 `account_required`; `parse-meal` 200 kural katmanı yanıtı, model çağrılmadı.
13. Uçak modu ile ilk açılış: login + misafir düğmesi, ağ gelince çalışır.

## 16. Yayına alma sırası ((SAHİP) işaretli adımlar sahibin işi)

1. Adım 0 spike'ı. Anonim giriş geçici olarak açık olmalı: Dashboard > Authentication > Sign In / Providers > "Allow anonymous sign-ins" (SAHİP). Spike bitince, sunucu kapısı canlıya çıkana kadar kapat.
2. `feature/ai-model-routing` develop'a girer. Ardından AI kapısı (bölüm 9) ayrı küçük bir PR ile eklenir. Kapı canlıya (`supabase functions deploy ai-suggest parse-meal`, SAHİP ya da sohbetteki onayıyla ajan) çıkmadan anonim giriş canlıda AÇILMAZ (ücretsiz 3 plan sızıntısı, bulgu 2).
3. Dashboard (SAHİP): "Allow anonymous sign-ins" AÇIK; "Allow manual linking" AÇIK; anonim giriş IP sınırını gözden geçir; "Change email address" e-posta şablonuna `{{ .Token }}` ekle. `supabase/config.toml` `[auth]` altına eşleşen yerel ayarlar da yazılır (`enable_anonymous_sign_ins = true`, `enable_manual_linking = true`) ki yerel ortam canlıyla aynı olsun.
4. `db push` (SAHİP onayıyla, proje hafızasındaki dry-run önce kuralı): olay adı kısıtı, huni görünümleri, `purge-stale-guests` cron. Sonra `pnpm db:types` ve tip commit'i.
5. Mobil sürüm: yeni EAS build (SAHİP "build al" derse). Anonim giriş anahtarı kapalıyken yeni sürüm bugünkü gibi login ekranına düşer; yani anahtar kill switch'tir: sorun çıkarsa kapatmak yeni açılışları login ekranına döndürür, mevcut misafirler çalışmaya devam eder.
6. Yayın sonrası ilk hafta: `guest_upgraded` / misafir oranı, `account_gate_shown` dağılımı, cron'un ilk koşusunda silinen sayısı (beklenen: ilk 30 günde sıfır).

## 17. Kapsam dışı (bilinçli)

- Misafir -> mevcut hesap veri birleştirme (karar a).
- Apple/Google ile giriş ve `linkIdentity` (ayrı iş, şimdilik e-posta).
- CAPTCHA/Turnstile (React Native'de WebView gerektirir; koruma: sunucu AI kapısı, IP sınırı, 30 gün temizliği).
- Web'de misafir modu.
- Misafir için "verilerimi indir".
- Misafir kullanım sınırı (ör. en fazla N görev): ilk sürümde yok.

## 18. Sahibin cevaplaması gereken açık sorular

1. Anonim giriş IP sınırını (varsayılan 30/saat) yükseltelim mi? Türkiye'de mobil operatör CGNAT'ı yüzünden kampanya gününde gerçek kullanıcılar 429 alabilir. Önerim: 300/saat; CAPTCHA yok.
2. Üretimde "Confirm email" açık mı? Bekleyen ekranın ne sıklıkta görüneceğini belirler; tasarım iki durumda da çalışıyor, bloklayıcı değil.
3. Hesap açıldıktan hemen sonra deneme (paywall) teklifi bir kez gösterilsin mi (bölüm 8, madde 5)? Önerim evet; ilk sürümde kapalı bırakıp ölçüme göre açmak da kabul.
4. Apple Hatırlatıcılar içe aktarması misafire serbest kalsın mı (önerim: evet, yerel veri) yoksa tüm entegrasyonlar ekranı kilitlensin mi?
5. `food_gaps.phrase` serbest metin; misafir silinince `user_id` NULL kalıp ifade korunuyor. Kabul mü, yoksa silinen kullanıcıda satırlar da silinsin mi (cascade'e çevirmek ayrı migration)?
