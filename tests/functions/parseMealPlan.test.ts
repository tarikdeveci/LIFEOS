import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planMealAi } from '../../supabase/functions/parse-meal/plan.ts'

test('ucretsiz kullanici yalnizca kural katmanini kullanir', () => {
  const plan = planMealAi({
    allowed: false, tier: 'free', status: 402, code: 'pro_required', error: 'x',
  })
  assert.deepEqual(plan, { pro: false, useModel: false, limited: false })
})

test('pro kullanici modeli kullanir', () => {
  assert.deepEqual(
    planMealAi({ allowed: true, tier: 'pro', overBudget: false }),
    { pro: true, useModel: true, limited: false },
  )
})

test('butce asimi modeli kapatmaz, yedek modele gecis generate icinde', () => {
  const plan = planMealAi({ allowed: true, tier: 'pro', overBudget: true })
  assert.equal(plan.useModel, true)
  assert.equal(plan.limited, false)
})

test('sert sinir dolunca kural katmanina duser ve sinirli isaretlenir', () => {
  const plan = planMealAi({
    allowed: false, tier: 'trial', status: 429, code: 'ai_budget_exhausted', error: 'x',
  })
  assert.deepEqual(plan, { pro: true, useModel: false, limited: true })
})
