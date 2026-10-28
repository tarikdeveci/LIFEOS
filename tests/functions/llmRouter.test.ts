import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRouter } from '../../supabase/functions/_shared/ai/llm/router.ts'
import type { AiModelRow, CatalogRows } from '../../supabase/functions/_shared/ai/llm/router.ts'

function model(over: Partial<AiModelRow> & { id: string }): AiModelRow {
  return {
    provider: 'openai_compat',
    api_model: 'gem-x',
    base_url: 'https://example.test/v1',
    api_key_secret: 'AI_KEY_GEMINI',
    input_per_mtok: '0.1',
    output_per_mtok: 0.4,
    cached_input_per_mtok: null,
    extra_params: { reasoning_effort: 'none' },
    enabled: true,
    ...over,
  }
}

const ENV: Record<string, string> = { AI_KEY_GEMINI: 'g-key', AI_KEY_ANTHROPIC: 'a-key' }
const env = (name: string) => ENV[name]

function catalog(over: Partial<AiModelRow> = {}): CatalogRows {
  return {
    models: [
      model({ id: 'gemini-x', ...over }),
      model({ id: 'sonnet-5-nothink', provider: 'anthropic', base_url: null, api_key_secret: 'AI_KEY_ANTHROPIC', api_model: 'claude-sonnet-5' }),
    ],
    routes: [{ route: 'brain_dump', primary_model: 'gemini-x', fallback_model: 'sonnet-5-nothink' }],
  }
}

test('router: tablo satırı kazanır', async () => {
  const router = createRouter({ load: async () => catalog(), env })
  const { primary, fallback } = await router.resolve('brain_dump')
  assert.equal(primary.id, 'gemini-x')
  assert.equal(primary.apiKey, 'g-key')
  assert.equal(primary.inputPerMtok, 0.1)
  assert.deepEqual(primary.extraParams, { reasoning_effort: 'none' })
  assert.equal(fallback?.id, 'sonnet-5-nothink')
})

test('router: 60 sn önbellek', async () => {
  let loads = 0
  let clock = 1_000
  const router = createRouter({ load: async () => { loads += 1; return catalog() }, env, now: () => clock })
  await router.resolve('brain_dump')
  await router.resolve('replan')
  assert.equal(loads, 1)
  clock += 60_001
  await router.resolve('brain_dump')
  assert.equal(loads, 2)
})

test('router: tablo hatası', async () => {
  let loads = 0
  const router = createRouter({ load: async () => { loads += 1; throw new Error('db kapali') }, env })
  const { primary, fallback } = await router.resolve('replan')
  assert.equal(primary.id, 'opus-5')
  assert.equal(fallback?.id, 'sonnet-5')
  await router.resolve('replan')
  assert.equal(loads, 1)
})

test('router: kapalı model', async () => {
  const disabled = createRouter({ load: async () => catalog({ enabled: false }), env })
  assert.equal((await disabled.resolve('brain_dump')).primary.id, 'sonnet-5-nothink')

  const missing = createRouter({
    load: async () => ({ models: [], routes: [{ route: 'task_priority', primary_model: 'yok', fallback_model: null }] }),
    env,
  })
  const { primary, fallback } = await missing.resolve('task_priority')
  assert.equal(primary.id, 'sonnet-5-nothink')
  assert.equal(fallback, null)

  // Birinci model sağlam, yedek kapalı: yedek yok.
  const noFallback = createRouter({
    load: async () => ({
      models: [model({ id: 'gemini-x' }), model({ id: 'kapali', enabled: false })],
      routes: [{ route: 'brain_dump', primary_model: 'gemini-x', fallback_model: 'kapali' }],
    }),
    env,
  })
  assert.equal((await noFallback.resolve('brain_dump')).fallback, null)
})

test('router: secret adı', async () => {
  const evil = createRouter({ load: async () => catalog({ api_key_secret: 'SUPABASE_SERVICE_ROLE_KEY' }), env: () => 'x' })
  assert.equal((await evil.resolve('brain_dump')).primary.id, 'sonnet-5-nothink')

  const noKey = createRouter({ load: async () => catalog(), env: (n) => (n === 'AI_KEY_GEMINI' ? undefined : 'a') })
  assert.equal((await noKey.resolve('brain_dump')).primary.id, 'sonnet-5-nothink')

  const http = createRouter({ load: async () => catalog({ base_url: 'http://example.test' }), env })
  assert.equal((await http.resolve('brain_dump')).primary.id, 'sonnet-5-nothink')
})

test('router: anthropic geçiş anahtarı', async () => {
  const router = createRouter({
    load: async () => { throw new Error('x') },
    env: (n) => (n === 'ANTHROPIC_API_KEY' ? 'old-key' : undefined),
  })
  assert.equal((await router.resolve('replan')).primary.apiKey, 'old-key')
})

test('router: ayrılmış alanlar extra_params içinden ayıklanır', async () => {
  const router = createRouter({
    load: async () => catalog({
      extra_params: { model: 'pahali', messages: [], system: 'x', tools: [], tool_choice: 'x', stream: true, max_tokens: 9, reasoning_effort: 'none' },
    }),
    env,
  })
  assert.deepEqual((await router.resolve('brain_dump')).primary.extraParams, { reasoning_effort: 'none' })
})

test('router: birinci modelin anahtarı yoksa ayarlı yedek öne geçer', async () => {
  const router = createRouter({
    load: async () => catalog(),
    env: (n) => (n === 'AI_KEY_GEMINI' ? undefined : ENV[n]),
  })
  const { primary, fallback } = await router.resolve('brain_dump')
  assert.equal(primary.id, 'sonnet-5-nothink')
  assert.equal(fallback, null)
})

test('router: cheap koddaki varsayılan yedeği taşır', async () => {
  const router = createRouter({ load: async () => catalog(), env })
  assert.equal((await router.resolve('replan')).cheap?.id, 'sonnet-5')
})

test('router: openai_compat satırı Anthropic anahtarını kullanamaz', async () => {
  const router = createRouter({ load: async () => catalog({ api_key_secret: 'AI_KEY_ANTHROPIC' }), env })
  const { primary } = await router.resolve('brain_dump')
  // Birinci reddedildi, ayarli yedek (anthropic) one gecti.
  assert.equal(primary.id, 'sonnet-5-nothink')
})

test('router: tabloda kapatılan model koddaki varsayılanla geri gelmez', async () => {
  const opus = model({ id: 'opus-5', provider: 'anthropic', base_url: null, api_key_secret: 'AI_KEY_ANTHROPIC', enabled: false })
  const router = createRouter({
    load: async () => ({ models: [opus], routes: [{ route: 'replan', primary_model: 'opus-5', fallback_model: null }] }),
    env,
  })
  const { primary, fallback, cheap } = await router.resolve('replan')
  assert.equal(primary.id, 'sonnet-5')
  assert.equal(fallback, null)
  assert.equal(cheap?.id, 'sonnet-5')

  // Rotanın varsayılan modellerinin hepsi kapalıysa sessizce çalışmaz, hata verir.
  const sonnet = model({ id: 'sonnet-5', provider: 'anthropic', base_url: null, api_key_secret: 'AI_KEY_ANTHROPIC', enabled: false })
  const allOff = createRouter({ load: async () => ({ models: [opus, sonnet], routes: [] }), env })
  await assert.rejects(allOff.resolve('replan'))
})

test('router: varsayılan yedeği olmayan rotada cheap varsayılan birinci modeldir', async () => {
  const router = createRouter({
    load: async () => ({ models: [model({ id: 'gemini-x' })], routes: [{ route: 'daily_plan', primary_model: 'gemini-x', fallback_model: null }] }),
    env,
  })
  const { primary, cheap } = await router.resolve('daily_plan')
  assert.equal(primary.id, 'gemini-x')
  assert.equal(cheap?.id, 'sonnet-5-nothink')
})
