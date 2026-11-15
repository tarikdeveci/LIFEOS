import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createLlmExtractor,
  createLlmFoodEstimator,
  createLlmPortionEstimator,
  createLlmVerifier,
} from '../../supabase/functions/_shared/nutrition/adapters/llm.ts'
import type { LlmCall, LlmRequest, LlmResult } from '../../supabase/functions/_shared/ai/llm/types.ts'
import type { Candidate } from '../../supabase/functions/_shared/nutrition/types.ts'

function fake(toolInput: Record<string, unknown> | null, apiModel = 'claude-sonnet-5') {
  const requests: LlmRequest[] = []
  const call: LlmCall = async (request) => {
    requests.push(request)
    const result: LlmResult = {
      text: '',
      toolInput,
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
      stopReason: 'tool',
      route: 'meal_extract',
      modelId: 'm',
      apiModel,
      costUsd: 0,
      mode: 'primary',
    }
    return result
  }
  return { call, requests }
}

test('cikarici arac semasi ile cagirir ve kalemleri okur', async () => {
  const { call, requests } = fake({
    nothing_eaten: false,
    items: [{ phrase: 'yumurta', quantity: 2, unit: 'adet', preparation: '', confidence: 0.9 }],
  })
  const extractor = createLlmExtractor(call)
  assert.equal(extractor.name, 'llm:meal_extract')

  const items = await extractor.extract('2 yumurta')
  assert.equal(items.length, 1)
  assert.equal(items[0]!.quantity, 2)
  assert.equal(requests[0]!.tool?.name, 'kalemleri_kaydet')
  assert.equal(requests[0]!.tool?.strict, true)
  assert.equal(requests[0]!.maxTokens, 2048)
})

test('cikarici arac cagrisi yoksa hata firlatir', async () => {
  const { call } = fake(null)
  await assert.rejects(() => createLlmExtractor(call).extract('2 yumurta'), /araç çağrısı/)
})

test('cikarici yazilan gramaji modele ragmen korur', async () => {
  const { call } = fake({
    nothing_eaten: false,
    items: [{ phrase: 'levrek', quantity: 1, unit: 'adet', preparation: '', confidence: 0.9 }],
  })
  const items = await createLlmExtractor(call).extract('1 adet Levrek(750gram)')
  assert.equal(items[0]!.quantity, 750)
  assert.equal(items[0]!.unit, 'g')
})

test('dogrulayici liste disi cevabi reddeder, hata olursa null doner', async () => {
  const candidates = [
    { ref: { id: 'a', label: 'Haşlanmış patates', per100g: { kcal: 87 } } },
    { ref: { id: 'b', label: 'Patates kızartması', per100g: { kcal: 312 } } },
  ] as unknown as Candidate[]

  const ok = fake({ chosen_id: 'b', reason: 'x' })
  assert.equal(await createLlmVerifier(ok.call).verify('kizarmis patates', candidates), 'b')
  assert.equal(ok.requests[0]!.tool?.name, 'adayi_sec')
  assert.equal(ok.requests[0]!.maxTokens, 512)

  const outside = fake({ chosen_id: 'zzz', reason: 'x' })
  assert.equal(await createLlmVerifier(outside.call).verify('p', candidates), null)

  const failing: LlmCall = async () => {
    throw new Error('ag')
  }
  assert.equal(await createLlmVerifier(failing).verify('p', candidates), null)
})

test('gram tahmini aralik uretir, sifir ise null doner', async () => {
  const ok = fake({ grams_min: 100, grams_likely: 150, grams_max: 200 })
  const interval = await createLlmPortionEstimator(ok.call).estimate('pilav', 'Pilav', 1, 'porsiyon')
  assert.deepEqual(interval, { min: 100, likely: 150, max: 200 })

  const zero = fake({ grams_min: 0, grams_likely: 0, grams_max: 0 })
  assert.equal(await createLlmPortionEstimator(zero.call).estimate('p', 'P', null, null), null)
})

test('yiyecek tahmini model alanina gercek api modelini yazar', async () => {
  const { call } = fake({
    is_food: true,
    name_tr: 'Pişi',
    name_en: 'Pisi',
    kcal_per_100g: 300,
    protein_per_100g: 7,
    carbs_per_100g: 40,
    fat_per_100g: 12,
    fiber_per_100g: 2,
    serving_grams: 50,
    is_countable: true,
    category: 'snack',
    note: 'n',
    confidence: 0.6,
  }, 'claude-opus-4-6')
  const food = await createLlmFoodEstimator(call).estimate('pisi', null)
  assert.equal(food?.model, 'claude-opus-4-6')
  assert.equal(food?.per100g.kcal, 300)
})

test('yiyecek degilse ya da cagri dusmusse null doner', async () => {
  const notFood = fake({ is_food: false })
  assert.equal(await createLlmFoodEstimator(notFood.call).estimate('asdf', null), null)
  const failing: LlmCall = async () => {
    throw new Error('x')
  }
  assert.equal(await createLlmFoodEstimator(failing).estimate('pisi', null), null)
})
