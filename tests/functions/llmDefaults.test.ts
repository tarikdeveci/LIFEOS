import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DEFAULT_MODELS, DEFAULT_ROUTES } from '../../supabase/functions/_shared/ai/llm/defaults.ts'
import { AI_ROUTES } from '../../supabase/functions/_shared/ai/llm/types.ts'

test('defaults: her rota tanımlı ve modelleri katalogda', () => {
  assert.deepEqual(Object.keys(DEFAULT_ROUTES).sort(), [...AI_ROUTES].sort())
  const ids = new Set(DEFAULT_MODELS.map((m) => m.id))
  for (const r of AI_ROUTES) {
    assert.ok(ids.has(DEFAULT_ROUTES[r].primary), r)
    const fb = DEFAULT_ROUTES[r].fallback
    if (fb) assert.ok(ids.has(fb), r)
  }
})

test('defaults: migration 072 ilk verisiyle aynı', () => {
  const sql = readFileSync('supabase/migrations/072_ai_model_routing.sql', 'utf8')
  for (const r of AI_ROUTES) {
    const { primary, fallback } = DEFAULT_ROUTES[r]
    assert.match(
      sql,
      new RegExp(`\\('${r}',\\s*'${primary}',\\s*${fallback ? `'${fallback}'` : 'NULL'}\\)`),
      r,
    )
  }
})

test('defaults: katalog fiyatları ve ek parametreler migration ile aynı', () => {
  const sql = readFileSync('supabase/migrations/072_ai_model_routing.sql', 'utf8')
  for (const m of DEFAULT_MODELS) {
    const extra = JSON.stringify(m.extraParams)
    assert.ok(sql.includes(`'${m.id}'`) && sql.includes(`'${m.apiModel}'`) && sql.includes(`'${extra}'`), m.id)
    assert.match(sql, new RegExp(`\\('${m.id}',[^\\n]*${m.inputPerMtok}, ${m.outputPerMtok}, '`), m.id)
  }
})
