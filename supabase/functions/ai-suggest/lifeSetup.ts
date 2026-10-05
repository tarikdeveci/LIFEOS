// supabase/functions/ai-suggest/lifeSetup.ts
// life_setup rotası: serbest metinle yazılmış hayat planını LifeSetupProposal'a çevirir.
// Öneri hiçbir yere kaydedilmez; istemci onay ekranında gösterir ve mevcut
// rutin/hedef/görev fonksiyonlarıyla uygular.

import { LIFE_SETUP_TEXT_MAX, buildLifeSetupPrompt, parseLifeSetup } from '../_shared/ai/lifeSetup.ts'
import { CHAT_EFFORT, firstText } from './model.ts'
import type { RouteContext } from './request.ts'

export async function handleLifeSetup(route: RouteContext): Promise<Response> {
  const { client, chatModel, ledger, lang, json } = route

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

  const { system, messages } = buildLifeSetupPrompt({ lang, text })
  const response = await client.messages.create({
    model: chatModel,
    output_config: CHAT_EFFORT,
    // Dusunme (effort low) ayni butceyi paylasiyor. Cikti 20 rutin, 10 hedef ve
    // 30 gorev tavaniyla ~5k token'a cikabilir; yarim JSON ayristirilamaz.
    max_tokens: 8000,
    system,
    messages,
  })
  await ledger.record(response)

  const proposal = parseLifeSetup(firstText(response))
  if (!proposal) return json({ error: 'AI yanıtı çözümlenemedi' }, 502)
  return json({ proposal })
}
