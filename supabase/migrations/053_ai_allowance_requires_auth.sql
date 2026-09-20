-- supabase/migrations/053_ai_allowance_requires_auth.sql
-- ai_allowance() kimliksiz çağrıda hata fırlatır.
--
-- NEDEN: fonksiyon SECURITY DEFINER ve sayacı auth.uid() üzerinden kuruyor.
-- Service role ile çağrıldığında auth.uid() NULL olur, WHERE hiçbir satırı
-- tutmaz ve fonksiyon hata yerine "3 ücretsiz hak, 0 maliyet" döner. Edge
-- function'larda kullanıcının JWT'siyle çalışan istemci ile service role
-- istemcisi aynı kapsamda duruyor (parse-meal); yanlış olanı geçilirse her free
-- kullanıcı her istekte sıfırlanmış bir sayaç görür, yani ücretsiz hak sınırsız
-- olur ve maliyet yanlış kullanıcıya yazılır. Hata sessizce AÇIK tarafa
-- düşüyordu; artık gürültülü biçimde KAPALI tarafa düşüyor.
--
-- Çağıranlar bu hatayı zaten ele alıyor (_shared/ai/usage.ts): sayaç
-- okunamazsa free kullanıcı kapalı, Pro açık. Arayüzdeki gösterge
-- (getAiAllowance) hatayı fırlatır ve "bilinmiyor" durumuna düşer.
--
-- 052'deki gövde birebir korunuyor; tek değişiklik baştaki kimlik kontrolü.
CREATE OR REPLACE FUNCTION public.ai_allowance()
RETURNS TABLE (free_plans_left INT, month_cost_usd NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ai_allowance: kimliksiz cagri, kullanici JWT''si gerekli'
      USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT
    GREATEST(0, 3 - count(*) FILTER (WHERE e.props->>'kind' = 'replan'))::int,
    COALESCE(sum(
      CASE
        WHEN jsonb_typeof(e.props->'cost_usd') = 'number'
         AND e.created_at >= date_trunc('month', now())
        THEN GREATEST((e.props->>'cost_usd')::numeric, 0)
      END
    ), 0)
  FROM events e
  WHERE e.user_id = auth.uid()
    AND e.name = 'ai_used';
END;
$$;

REVOKE ALL ON FUNCTION public.ai_allowance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_allowance() TO authenticated, service_role;
