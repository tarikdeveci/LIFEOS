import test from 'node:test'
import assert from 'node:assert/strict'
import { AI_BENEFIT_KEYS, aiBenefitKey, shouldShowFreeLeft } from '../../apps/mobile/src/ai/benefit.ts'
import { aiEn, aiTr } from '../../apps/mobile/src/i18nAi.ts'

test('bilinen kaynak kendi fayda metnine gider', () => {
  assert.equal(aiBenefitKey('brain_dump'), 'ai_benefit_brain_dump')
  assert.equal(aiBenefitKey('free_limit'), 'ai_benefit_free_limit')
})

test('bilinmeyen, boş ve prototip anahtarları genel metne düşer', () => {
  for (const source of [undefined, null, '', 'onboarding', 'post_signup', 'constructor', 'toString']) {
    assert.equal(aiBenefitKey(source), 'ai_benefit_default')
  }
})

test('her fayda anahtarının tr ve en metni var, boş değil', () => {
  const keys = [...Object.values(AI_BENEFIT_KEYS), 'ai_benefit_default'] as const
  for (const key of keys) {
    assert.ok(aiEn[key].length > 0, key)
    assert.ok(aiTr[key].length > 0, key)
  }
  assert.deepEqual(Object.keys(aiEn).sort(), Object.keys(aiTr).sort())
})

test('kalan hak yalnız Pro olmayan ve hakkı olan kullanıcıya gösterilir', () => {
  assert.equal(shouldShowFreeLeft(false, 2), true)
  assert.equal(shouldShowFreeLeft(false, 0), false)
  assert.equal(shouldShowFreeLeft(false, null), false)
  assert.equal(shouldShowFreeLeft(true, 3), false)
})
