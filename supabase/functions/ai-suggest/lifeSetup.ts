// supabase/functions/ai-suggest/lifeSetup.ts
// life_setup rotası: serbest metinle yazılmış hayat planını LifeSetupProposal'a çevirir.
// Öneri hiçbir yere kaydedilmez; istemci onay ekranında gösterir ve mevcut
// rutin/hedef/görev fonksiyonlarıyla uygular.

import { LIFE_SETUP_TEXT_MAX, buildLifeSetupPrompt, parseLifeSetup } from '../_shared/ai/lifeSetup.ts'
import type { RouteContext } from './request.ts'

export async function handleLifeSetup(route: RouteContext): Promise<Response> {
  const { generate, ledger, lang, json } = route

  // Uzun metni sessizce kesmek planın sonundaki kuralları kaybettirirdi: reddet.
  // Doğrulama model çağrısından önce, yani hak ya da maliyet doğmuyor.
  const text = typeof route.body.text === 'string' ? route.body.text.trim() : ''
  if (!text) return json({ error: 'Metin boş', code: 'text_empty' }, 400)
  if (text.length > LIFE_SETUP_TEXT_MAX) {
    return json({
      error: `Metin en çok ${LIFE_SETUP_TEXT_MAX} karakter olabilir`,
      code: 'text_too_long',
      max: LIFE_SETUP_TEXT_MAX,
    }, 400)
  }

  // Ücretsiz katmanda hak model çağrısından ÖNCE atomik ayrılır (usage.ts).
  if (!await ledger.begin()) return json({ error: 'AI access requires Pro', code: 'pro_required' }, 402)

  const { system, messages } = buildLifeSetupPrompt({ lang, text })
  // Dusunme (effort low) ayni butceyi paylasiyor. Cikti 20 rutin, 10 hedef ve
  // 30 gorev tavaniyla ~5k token'a cikabilir; yarim JSON ayristirilamaz.
  const result = await generate({ system, messages, maxTokens: 8000 })
  // Ayrıştırılamayan ya da max_tokens'ta kesilen yanıt hak yakmaz; maliyet yine yazılır.
  const proposal = result.stopReason === 'max_tokens' ? null : parseLifeSetup(result.text)
  if (!proposal) ledger.markFailed()

  if (!proposal) return json({ error: 'AI yanıtı çözümlenemedi' }, 502)
  return json({ proposal })
}
