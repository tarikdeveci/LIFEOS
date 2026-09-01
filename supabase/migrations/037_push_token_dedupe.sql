-- Bir push token'ın tek sahibi, bir kullanıcının tek token satırı olsun.
--
-- SORUN: Aynı bildirim tek cihaza birden çok kez düşüyordu. Gönderim kodu aynı
-- token METNİNİ tekilleştirir ama bu tekilleştirme kullanıcı başınadır: farklı
-- user_id'lere bağlı aynı token, döngünün ayrı turlarında ayrı mesaj üretir ve
-- her biri aynı cihaza teslim edilir.
--
-- Canlıda görülen tablo buydu: TEK bir iOS token'ı ÜÇ farklı user_id'ye bağlıydı,
-- üçünün de digest saati aynıydı (08:00/13:00/21:00) ve notification_log üçünün
-- de her gün ayrı ayrı gönderim aldığını gösteriyordu. Cihaz her sabah aynı
-- bildirimi üç kez alıyordu.
--
-- Bu aynı zamanda bir gizlilik sorunudur: cihaz, o an giriş yapmış olmayan iki
-- hesabın görev ve beslenme özetini gösteriyor.
--
-- KÖK NEDEN: Çıkışta (signOut) token satırı silinmiyordu. Cihazda hesap
-- değiştikçe yeni satır ekleniyor, eskisi tabloda kalıyordu. İstemci bunu kendi
-- başına temizleyemez — RLS başka kullanıcının satırını sildirmez — bu yüzden
-- devralma veritabanı tarafında, trigger ile yapılır.

-- 1) Her (user_id, platform) için en yenisi hariç sil.
--    COALESCE şart: created_at NULL olabilir (019'da DEFAULT var ama NOT NULL yok)
--    ve NULL'lu satır karşılaştırması NULL döner — o satır ne silinir ne de
--    başkasını sildirir, sonra 2. adımdaki kısıt eklemesi patlardı.
DELETE FROM push_tokens t
USING push_tokens newer
WHERE t.user_id = newer.user_id
  AND t.platform = newer.platform
  AND (COALESCE(newer.created_at, 'epoch'::timestamptz), newer.id)
    > (COALESCE(t.created_at, 'epoch'::timestamptz), t.id);

-- 2) Kısıt yoksa ekle. 019 bunu tanımlıyor ama IF NOT EXISTS ile oluşturulan bir
--    tabloda kısıt uygulanmamış olabilir; idempotent olarak garantiye alıyoruz.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.push_tokens'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[
        (SELECT attnum FROM pg_attribute
          WHERE attrelid = 'public.push_tokens'::regclass AND attname = 'user_id'),
        (SELECT attnum FROM pg_attribute
          WHERE attrelid = 'public.push_tokens'::regclass AND attname = 'platform')
      ]::smallint[]
  ) THEN
    ALTER TABLE public.push_tokens
      ADD CONSTRAINT push_tokens_user_platform_key UNIQUE (user_id, platform);
  END IF;
END
$$;

-- 3) Bir token = bir cihaz kurulumu = tek sahip. Aynı token'ı taşıyan eski
--    satırları sil, en son kaydedileni bırak: cihazda en son giriş yapan hesap
--    o cihazın güncel sahibidir.
DELETE FROM push_tokens t
USING push_tokens newer
WHERE t.token = newer.token
  AND t.id <> newer.id
  AND (COALESCE(newer.created_at, 'epoch'::timestamptz), newer.id)
    > (COALESCE(t.created_at, 'epoch'::timestamptz), t.id);

-- 4) Devralma trigger'ı: bundan sonra token nereye yazılırsa yazılsın, o token'ı
--    tutan diğer kullanıcıların satırları düşer.
--
--    SECURITY DEFINER gerekli: silinen satır çağıranın değil BAŞKA bir
--    kullanıcının satırıdır, RLS bunu istemciye yaptırmaz.
--
--    UNIQUE (token) kısıtı yerine trigger tercih edildi, çünkü kısıt yeni girişi
--    REDDEDER — cihazda hesap değiştiren kullanıcı hiç bildirim alamaz hâle
--    gelirdi. Doğru davranış reddetmek değil, devretmek.
CREATE OR REPLACE FUNCTION public.push_tokens_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.push_tokens
  WHERE token = NEW.token
    AND user_id <> NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_tokens_claim_trg ON public.push_tokens;
CREATE TRIGGER push_tokens_claim_trg
  BEFORE INSERT OR UPDATE OF token ON public.push_tokens
  FOR EACH ROW EXECUTE FUNCTION public.push_tokens_claim();

-- 5) notification_log artık blok hatırlatmalarının da kilidi (kind = 'block_<id>'),
--    yani günde kullanıcı başına birkaç satır yazılıyor. Buradaki silme yalnızca
--    birikmiş geçmişi kesiyor; SÜREKLİ temizlik daily-digest'in her koşusunda
--    yapılıyor (saat başı, sent_at indeksi üzerinden). 031 indeksi eklemiş ama
--    temizliği hiçbir yere koymamıştı.
DELETE FROM notification_log WHERE sent_at < NOW() - INTERVAL '30 days';
