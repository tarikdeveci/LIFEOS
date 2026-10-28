---
name: persona-test
description: LifeOS mobil uygulamasını emülatörde gerçek kullanıcı gibi kullanan persona testi. Persona kartı ve görev senaryosuyla ajan katmanında bir test ajanı koşar; ajan ekranı metin olarak döker, numarayla dokunur, birinci ağızdan rapor yazar. "persona testi", "persona turu", "kullanıcı gibi dene", "emülatörde kullanıcı testi", "kalibrasyon turu" denince veya WORKFLOW.md kapı 7'de kullan.
---

# Persona testi

Amaç: kodu okumadan, ekranı kullanarak bulunacak sorunları bulmak. Test ajanı kod incelemez,
dosya açmaz; sadece ekranda ne yazıyorsa onu görür ve persona kartındaki insan gibi davranır.
Rapor birinci ağızdandır ("Kaydet'i bulamadım"), teknik teşhis içermez; teşhis ana oturumun işidir.

Kaynaklar bu klasörde:
- `personas.md`: 6 persona, sabır bütçesi, cihaz ayarı, persona ve senaryo tablosu.
- `senaryolar.md`: S1 ile S9 görev senaryoları, başarı ölçütü, test listesi maddeleri (#n).
- `ekran.mjs`: ajanın emülatördeki eli ve gözü.

## Önkoşullar

- Emülatör açık ve `adb devices` tek cihaz gösteriyor (`windows-local-android-build` notundaki
  emülatör açma adımı).
- Build: release veya dahili build. Dev build'de metindeki iki "r" RN yenilemesini tetikler ve
  koşuyu bozar.
- Hesap: senaryonun başlangıç durumu (`senaryolar.md`). Test hesabı kullanılır; canlı hesapta
  persona koşulmaz. Kimlik bilgisi bu skill'de ve ajan görev metninde yer almaz: girişi kullanıcı
  koşudan önce elle yapar. Hesap açılmaz, satın alınmaz.
- Senaryonun oluşturduğu veri koşu sonunda silinir; silinemediyse raporda yazılır.

## Hazırlık (cihaz ayarı)

Persona kartındaki cihaz ayarı koşudan önce yapılır, koşudan sonra geri alınır:

```bash
ADB="$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe"
"$ADB" shell settings put system font_scale 1.3        # P1; geri: 1.0
"$ADB" shell "setprop persist.sys.locale en-US; stop; start"   # P4, emülatörde; geri: tr-TR
"$ADB" shell pm reset-permissions -p tr.lifeos.app      # S7
"$ADB" shell pm clear tr.lifeos.app                     # S8 (giriş de silinir)
```

Dil değişikliği emülatörü yeniden başlatır; bitince `adb wait-for-device` ve kilit ekranı kontrolü.

## Ekran aracı

```bash
node .claude/skills/persona-test/ekran.mjs sifirla     # senaryo başında adım sayacı
node .claude/skills/persona-test/ekran.mjs             # ekranı numaralı liste olarak dök
node .claude/skills/persona-test/ekran.mjs dokun 5     # listedeki [5]'e dokun
node .claude/skills/persona-test/ekran.mjs yaz "Dis hekimi"
node .claude/skills/persona-test/ekran.mjs geri
node .claude/skills/persona-test/ekran.mjs kaydir asagi
node .claude/skills/persona-test/ekran.mjs ac
```

Her eylem adım sayar ve yeni ekranı basar. Satırda öğe türü (alan, dokunulur, metin, kayar) ve
bayraklar görünür: `seçili`, `odakta`, `pasif`, `küçük hedef` (44 dp altı, `DESIGN.md`).
`(ikon, etiketsiz)` ekran okuyucunun da bir şey okumadığı ikondur; persona bunu "anlamadığım
simge" olarak yorumlar.

Döküm `adb uiautomator dump` ile alınır; 3 denemede alınamazsa Maestro `hierarchy` kullanılır
(`~/.maestro/maestro/bin/maestro.bat`, PATH'te değil, araç yolu kendisi bulur).

### Emülatör tuzakları

- `uiautomator dump` "could not get idle state" verip eski dosyayı bırakabilir; araç önce dosyayı
  siler. Animasyonlu ekranda döküm gecikir: tekrar `ekran` çağır.
- `adb input text` ASCII dışı yazamaz. Araç Türkçe harfleri çevirir ve not düşer; bu bir bulgu değil.
- Enter klavyeyi kapatabilir; sonraki yazma alana gitmez. Her `yaz`dan önce alana `dokun`.
- Git Bash'te `/sdcard` gibi yollar Windows yoluna çevrilir; elle adb komutunda `MSYS_NO_PATHCONV=1`.
- Sistem penceresi (izin, Health Connect) başka pakettir; döküm onu da gösterir, dokunma çalışır.

## Koşma (ajan katmanı)

Test ajanı `ajan` katmanında koşar, Claude kotası harcanmaz. Ekran görüntüsüyle tıklayan Claude
ajanı açılmaz. Bir persona ve senaryo çifti bir koşudur; paralel koşu yoktur (tek emülatör).

```bash
ajan -m yedek --bg "<görev metni>"
```

Görev metni şu parçalardan kurulur (sırayla, tamamı metne yapıştırılır, dosya yolu verilmez ki
ajan kod okumaya gitmesin):

1. "Sen bir uygulama test kullanıcısısın. Kod okumazsın, dosya açmazsın, dosya yazmazsın.
   Tek aracın: `node <mutlak yol>/ekran.mjs` ve alt komutları." ve "Ekran aracı" bölümündeki komutlar.
2. Persona kartı (`personas.md`'den tam metin).
3. Senaryonun "Başlangıç" ve "Hedef" satırları (Başarı ve İlgili satırları verilmez).
4. Kurallar: sabır bütçesi bitince dur; hesap açma, şifre girme, satın alma yok; her eylemden önce
   ne düşündüğünü bir cümleyle yaz; bitince "Rapor biçimi"ndeki raporu yaz ve dur.

Koşu bitince:
- Log yolu `ajan`'ın bastığı yerdedir; raporu oradan oku.
- Repoyu tara: `git status --short`. Ajanın bıraktığı her dosya silinir (ajan `--oku` modunda bile
  dosya bırakabilir).
- Cihaz ayarını geri al (Hazırlık), test verisini sil.

## Rapor biçimi

```
Persona: P1 Nermin | Senaryo: S4 | Build: 1.0.4 (32) | Tarih: YYYY-AA-GG
Sonuç: tamamlandı | yarım | vazgeçti
Adım: 14 (bütçe 12)
Takıldığım yerler:
- adım 6: "Rutin" yazısını bulamadım, (ikon, etiketsiz) düğmeye iki kez bastım.
Ne düşündüm: birinci ağızdan 3 ile 5 cümle.
Puan: 4/10
Kullanmaya devam eder miydim: hayır, çünkü ...
```

Ham raporlar `.claude/skills/persona-test/raporlar/` altına kaydedilir (gitignore'lu, repoya girmez).
Dosya adı: `YYYY-AA-GG-P1-S4.md`.

## Ana oturumun işi

Persona raporu kanıt değil gözlemdir. Ana oturum:
1. Her takılmayı ekranda kendisi yeniden üretir (`ekran.mjs` ile, aynı adımlar).
2. Üretilen her sorunu `senaryolar.md`'deki ilgili #n ile eşler; listede olmayan yeni sorunu
   `docs/KALAN_ADIMLAR.md`'ye ilgili faza madde olarak ekler.
3. Raporların özetini kullanıcıya sohbette verir; özet dosyası yazmaz.

## Kalibrasyon

Persona testinin işe yaradığını ölçmek için, ilk kez ve persona veya senaryo değişince koşulur.
Kullanıcı onayı olmadan başlatılmaz (emülatör ve test hesabı gerekir).

1. Bugünkü yayındaki build ile her persona kendi senaryolarını koşar (`personas.md` tablosu).
2. Bulunanlar, `docs/KALAN_ADIMLAR.md`'deki 53 maddelik test mühendisi listesiyle karşılaştırılır:
   hangi #n bulundu, hangisi kaçtı.
3. Kaçan her madde için sebep yazılır: senaryo oraya gitmiyor mu, persona bunu fark edecek biri değil
   mi, araç onu göstermiyor mu. Senaryo, persona kartı veya `ekran.mjs` buna göre düzeltilir.
4. Hedef: maddelerin çoğunu personalar bulur. Sonuç ve oran kullanıcıya sohbette bildirilir.
