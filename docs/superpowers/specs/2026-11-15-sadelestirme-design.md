# Sadeleştirme tasarımı (Faz 5)

Tarih: 2026-11-15. Kaynak: test mühendisinin #50, #51, #52 maddeleri ("uygulama aşırı karmaşık, daha basit UI, daha kolay kullanım"), modül maddeleri (#19, #21, #33, #35, #40, #41, #43) ve `docs/rules/UX.md`.
Bu belge kod içermez; Faz 6 işleri bu kararlara göre yapılır.

## 1. İlkeler

1. Sekme başına tek birincil eylem, en üstte ve yazılı (yalnız ikon değil). İkinciller ya küçük ikon ya da "Daha fazla" altında (UX 6).
2. Hiçbir özellik silinmez ve başka sekmeye taşınmaz (UX 8: sekmeye taşımak silmek sayılır). Sadeleştirme yalnız üç araçla yapılır: sıralama, aynı sekme içinde katlama, metin ve etiketi sadeleştirme.
3. Kullanıcının bilmediği kavram ekranda ham görünmez: "WSJF 1.5" yerine "Öncelik: yüksek" (#19, #21).
4. Bir kart tek soruya cevap verir. Aynı bilgi aynı ekranda iki kez gösterilmez; ikinci gösterim katlanır.
5. Mevcut kartların varsayılan görünümü sahibin kararı olmadan değişmez (UX 8, 2026-10-05). Bu belgedeki değişiklikler bu yüzden "katla, etiketle, sırala" sınırında kalır; kartların içeriği aynı kalır.

## 2. Ölçüm: görev testi

Önce ve sonra aynı beş iş, aynı persona setiyle (persona-test skill'i) ve test mühendisiyle:

| İş | Başarı | Ölçülen |
|----|--------|---------|
| Görev ekle (yarın, 30 dk) | Görev Görevler > Hafta'da görünür | adım, süre, takılma |
| Öğün ekle ("2 yumurta, 1 dilim ekmek") | Beslenme > Bugün kalorisi artar | adım, süre, takılma |
| Kilo gir (72,5) | Profil'de ve grafikte 72,5 | adım, süre, takılma |
| Rutin ekle (hafta içi 07:00, 15 dk) | Planlama'da yarın blok olarak | adım, süre, takılma |
| Antrenman başlat ve bir set gir | Geçmiş'te o günün kaydı | adım, süre, takılma |

Hedef: her iş en çok 5 dokunuş ve hiçbir personada "nerede olduğunu bulamadım" takılması yok.

Sayım kuralları (iki koşu aynı kuralla sayılsın diye):
- Başlangıç: uygulama açık, Bugün sekmesinde, klavye kapalı.
- Dokunuş: her ayrı dokunuş bir sayılır (düğme, sekme, çip, seçicide "Tamam"). Metin yazmak tek dokunuş sayılır (alana dokunmak ayrı). Kaydırma sayılmaz ama not edilir.
- Takılma: personanın 20 saniyeden uzun aradığı ya da yardım istediği an. Süre sınırı iş başına 3 dakika; aşılırsa iş başarısız.
- Veri: "önce" koşusundan sonra o koşunun kayıtları silinir, "sonra" koşusu aynı boş başlangıçla başlar.
- Build: "önce" Faz 6'nın ilk birleşmesinden önceki `develop` SHA'sı (`9d4687e`), "sonra" Faz 6 bittiği andaki `develop` SHA'sı; ikisi de rapora yazılır.
Koşu canlı hesaba yazdığı için ayrı test hesabı ister (KALAN_ADIMLAR G7 kararı); o gelene kadar "önce" ölçümü yapılmaz, Faz 6 sonunda iki ölçüm aynı hesapta art arda koşulur (önce `develop` öncesi build, sonra yeni build).

## 3. Ekran ekran

Mevcut durum 2026-11-15'te Android emülatörde girişli hesapta metin dökümüyle çıkarıldı.

### 3.1 Bugün

Bugün: başlık (tarih, Profil, Ayarlar), Health Connect daveti, Görevler özeti, Takvim özeti, Beslenme özeti.
Durum zaten UX 8'e uygun (yalnız sekme özetleri). Birincil eylem yok, bilerek: Bugün özet ekranıdır.

Sonra:
- Özet kartları bugünkü haliyle kalır (öğe sayıları dahil; Görevler özeti bugün üç görev gösteriyor). Görevler özeti "Bekleyen 2, Tamam 0, Planlandı 5s" satırını korur.
- Görevler ve takvim bağı (#33): Takvim özetinde "Şu an" bloğundan sonra en yakın bekleyen görev tek satır ("Sıradaki görev: ..."). Yeni kart değil, mevcut özete satır (UX 6 yuva kuralı). Planlama'da aynı satır "Sıradaki" kartının altına gelir (3.2).
- Antrenman özeti (#41): bugün aktif programın günü varsa ("Gün B, Pull") Bugün'e tek satırlık özet. Antrenman sekmesinin özeti olduğu için UX 8 ile çelişmez; Faz 6'da emülatörde kart sayısı tartıldıktan sonra eklenir.
- #4 (başlık sabit) test mühendisine soruldu; cevaba kadar değişmez.

### 3.2 Planlama

Bugün sırayla: başlık ("Günü planla" AI, etiketsiz "+"), hafta şeridi, "Şu an" kartı (odak düğmesi), "Sıradaki", Alışkanlıklar, Program (zaman çizelgesi), "Bu hafta" (Haftalık hedefler, Haftam).
Sorun: birincil eylem ("+", blok ekle) etiketsiz ve AI düğmesiyle aynı ağırlıkta; ekranın ilk yarısı zaman çizelgesine gelmeden dolu.

Sonra:
- Birincil eylem: başlıkta yazılı "Ekle" düğmesi (blok, rutin, alışkanlık seçimi aynı sheet'te). "Günü planla" ikon düğmesine iner, erişilebilirlik etiketi "AI ile günü planla".
- En yakın bekleyen görev (#33): "Sıradaki" kartının altında tek satır, dokununca görev ayrıntısı.
- Sahip kararı bekleyenler (varsayılan görünümü değiştirdiği için ilke 5): "Şu an" ve "Sıradaki"yi tek kartta birleştirmek; Alışkanlıklar'ı tek satır özete ("Alışkanlıklar 1/2") katlamak. Faz 6'da emülatörde önce ve sonra metin dökümüyle sahibe seçenek olarak sunulur, onaya kadar yapılmaz.
- "Bu hafta" bölümü sayfanın sonunda kalır; başlığına sayısal özet (#42 sorusu cevaplanınca).
- Hafta şeridi (#43) büyür ve yatay kayar (Faz 6).
- Bloğa dokununca düzenleme açılır (#30, Faz 6). Bugün dokunuş yalnız tamamlama.

### 3.3 Görevler

Bugün: başlık ("Beyin boşalt", etiketsiz "+"), sayaçlar (Bugün açık, Tamamlandı, Toplam), Bugün/Hafta/Tümü, "Tamamlananlar gizli", liste. Kartta "WSJF 1.5".
Yeni Görev sheet'i: başlık, tarih, süre, ardından her zaman açık 5 satır WSJF (25 küçük düğme).

Sonra:
- Birincil eylem: yazılı "Yeni görev". "Beyin boşalt" ikincil (ikon ve etiket).
- Sayaçlar (Bugün açık, Tamamlandı, Toplam) yerinde kalır. Tek satıra indirmek görünümü değiştirdiği için sahip kararı bekler (ilke 5).
- Kartta "WSJF 1.5" yerine öncelik etiketi, mevcut `wsjfToPriorityLabel` (`packages/shared/src/utils/priority.ts`) ile: kritik, yüksek, orta, düşük. Varsayılan skorlar (hepsi 3, skor 1.5) "yüksek"e düştüğü için etiket yalnız kullanıcı önceliği ayarladıysa görünür; varsayılan görevde etiket yok. Sıralama skorla devam eder.
- Yeni Görev: başlık, tarih, süre ve "Ekle". WSJF "Önceliği ayarla" düğmesinin altına katlanır, kapalıyken beşi de 3 (#21). Açılınca üstte tek cümle: "Değer, aciliyet ve riski çaba ve zorluğa bölerek sırayı belirler." (#19). Görev ayrıntısında da aynı.
- Görev eklerken "Takvime ekle" (#34): tarih seçilince görünen tek anahtar, varsayılan kapalı.

### 3.4 Beslenme

Bugün: başlık (etiketsiz "+"), Bugün makro özeti, Hızlı Yiyecek Ara, öğünler.
Sıra UX 8'deki karara uygun; en sade sekme.

Sonra:
- Birincil eylem: başlıktaki "+" yazılı "Öğün ekle" olur. İçerik sırası (makro özeti, Hızlı Yiyecek Ara, öğünler) UX 8 kararı olduğu için değişmez.
- Öğün ekle sheet'i: tek serbest metin girişi. "Elle gir" (#25, makrolar) ve gram/adet seçimi (#36) metin girişinin altında katlanır.
- Kalori hedefi makrolardan hesaplanır (#11): hedef ekranında kalori alanı salt okunur, altında "4 x protein + 4 x karbonhidrat + 9 x yağ".

### 3.5 Antrenman

Bugün: başlık, alt sekmeler (Bugün, Programlar, Kütüphane, Geçmiş). Bugün alt sekmesi: boş durum, "Antrenman Başlat", haftalık sayaçlar, Antrenman Koçu, Kas Haritası.
Sorun (#35): dört alt sekme ve program sheet'inin dört iç görünümü; aktif programın bugünkü günü Bugün'de yok (#41). Program ayrıntısında hareket ekleme, çıkarma ve uyarlama var (`workout.tsx`); #40'ın hangi düzenlemeyi kastettiği (program adı, gün adı, hareket sırası, set ve tekrar) Faz 6 başında program açılarak tek tek çıkarılır ve eksik olanlar yapılır.

Sonra:
- Birincil eylem: aktif program varsa "Gün B: Pull başlat", yoksa "Antrenman Başlat". İkisi de en üstte tek büyük düğme (UX 8: Antrenman Başlat en üstte).
- Alt sekmeler kalır (taşımak silmek sayılır), ama Bugün alt sekmesi başlangıç noktasıdır; Programlar'da "aktif program" kartı en üstte, eksik düzenlemeleri açan düğmeyle (#40).
- Antrenman sırasında egzersiz ekleme: arama kutusu, altında "son kullanılanlar" ve "bu programda"; kas grubu filtresi katlanır.
- Antrenman Koçu ve Kas Haritası yerinde kalır; Kas Haritası görsellerine çevrilmiş erişilebilirlik etiketi.

### 3.6 Profil ve Ayarlar

Faz 2'de ayrıldı (Bugün başlığında Profil ve Ayarlar). Bu belge değiştirmez; misafir modu (Faz 7) Profil'e hesap kartını ekler.

## 4. Faz 6'ya iş listesi

Sıra, görev testindeki işlere en çok dokunana göre:
1. Görevler: yazılı birincil eylem, WSJF katlama ve açıklama, öncelik etiketi (#19, #21).
2. Antrenman: bugünkü program günü düğmesi ve Bugün özeti (#41), program düzenleme (#40), egzersiz ekleme sırası (#35).
3. Planlama: yazılı "Ekle", Şu an ve Sıradaki birleşimi, alışkanlık katlama, bloğa dokununca düzenleme (#30), hafta şeridi (#43).
4. Beslenme: elle makro (#25), gram/adet (#36), makrodan kalori (#11).
5. Bugün: sıradaki görev satırı (#33), Planlama'daki aynı satırla birlikte.
6. Erişilebilirlik: KALAN_ADIMLAR Faz 6 "Erişilebilirlik ve dokunma alanı" listesi (alt sekme etiketleri, 44dp altı hedefler, tarih çiplerinin seçili durumu, kas haritası etiketleri). Her ekranın işi o ekranın dalında yapılır; kabul: hedefler 44dp (ya da `hitSlop` ile 44dp), etiketler emülatör metin dökümünde çevrilmiş görünür.

Her madde WORKFLOW kapılarından geçer; UX'e dokunduğu için kapı 7 (persona turu) test hesabı gelince toplu koşulur.

Bu belge yalnız sadeleştirmeyi kapsar. KALAN_ADIMLAR Faz 6'daki yeni yetenekler (Planlama: #27 ve #28 haftalık hedef yazı ve silme, kötü gün modu, güne göre rutin saati, gece yarısını geçen blok, alışkanlık ve blok bağı, gün bölümü, tekrar uyarısı; Antrenman: #44 program ve rutin bağı) kendi kabul koşullarıyla oradaki maddelerde yürür; sadeleştirme ilkeleri (bölüm 1) onlar için de geçerlidir.

## 5. Kapsam dışı

- Kart kaldırma, sekme birleştirme, alt sekme kaldırma: UX 8 gereği ancak sahibin gerekçeli seçenekle onayıyla.
- Görsel yeniden tasarım (renk, tipografi): DESIGN.md değişmez.
