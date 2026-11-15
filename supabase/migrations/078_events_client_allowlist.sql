-- supabase/migrations/078_events_client_allowlist.sql
-- İstemci events tablosuna yalnızca kendi ölçüm olaylarını yazabilir.
--
-- NEDEN: events_insert_own (076) yalnızca veritabanının yazdığı iki olayı
-- (guest_started, account_upgraded) dışarıda bırakıyordu. Kullanıcı kendi
-- JWT'siyle `ai_used` satırı ekleyebiliyordu: analytics.ai_route_health ve
-- haftalık AI kullanıcı sayıları sahte satırla bozulabiliyordu (güvenlik
-- incelemesi 2026-10-28, düşük). `ai_fallback_notified` da istemciye açıktı.
--
-- KARAR: dışlama listesi yerine izin listesi. İstemcinin yazdığı olaylar
-- yalnızca paywall_view ve account_gate_shown; gerisini sunucu (service role)
-- ya da veritabanı tetikleyicisi yazar. Yeni bir istemci olayı eklemek bu
-- politikayı da değiştirmeyi gerektirir: kasıtlı sürtünme (040 ile aynı ilke).
--
-- SIRA (önemli): ai-suggest ve parse-meal `ai_used` satırını artık service
-- role ile yazıyor (_shared/ai/usage.ts). Bu migration, o function'lar deploy
-- edilmeden canlıya alınırsa eski kod Pro kullanıcının satırını yazamaz ve
-- maliyet kaydı kaybolur. Önce function deploy, sonra db push.
-- Ücretsiz katman etkilenmez: reserve_ai_use SECURITY DEFINER, politikayı aşar.

DROP POLICY IF EXISTS "events_insert_own" ON public.events;
CREATE POLICY "events_insert_own" ON public.events
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND name IN ('paywall_view', 'account_gate_shown')
  );
