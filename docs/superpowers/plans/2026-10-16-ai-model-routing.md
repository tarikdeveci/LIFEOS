# AI model yönlendirme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI işlerinin modelini tablodan, rota başına ve uzaktan seçmek; bütçeyi net gelirin payına bağlamak; bütçe dolunca AI'ı durdurmak yerine ucuz yedek modele geçmek.

**Architecture:** `supabase/functions/_shared/ai/llm/` altında sağlayıcıdan bağımsız bir `generate()` katmanı, iki adaptör (Anthropic SDK, OpenAI uyumlu `fetch`) ve `ai_models` / `ai_model_routes` tablolarını 60 sn önbellekle okuyan bir router. `usage.ts` bütçeyi `net_monthly_usd` üzerinden hesaplar, `AiLedger` yeni ölçüm alanlarını yazar, `ai-suggest` ve `parse-meal` her model çağrısını `generate()` üzerinden yapar.

**Tech Stack:** Supabase Edge Functions (Deno, TypeScript strict), PostgreSQL migration, Node `node:test` (`--experimental-strip-types`), Next.js route handler (PayTR).

**Spec:** `docs/superpowers/specs/2026-10-16-ai-model-routing-design.md`

## Global Constraints

- Dal: `feature/ai-model-routing` (develop'tan). Feature dalına push serbest; PR açmadan önce kullanıcıya sor.
- Commit mesajlarına `Co-Authored-By` satırı EKLENMEZ.
- Hiçbir metinde (kod yorumu, commit, kullanıcı metni) uzun tire veya orta tire kullanılmaz.
- TypeScript strict, `any` yok; named export; dosya başına 500 satır sınırı.
- Ortam değişkenleri ve varsayılanları: `AI_BUDGET_SHARE=0.4`, `AI_DEFAULT_BUDGET_USD=0.38`, `AI_TRIAL_BUDGET_USD=0.5`, `AI_ABUSE_CAP_USD=5`, `AI_DEFAULT_TAX_PCT=0.167`, `AI_DEFAULT_COMMISSION_PCT=0.15`, web tarafında `AI_USD_TRY` (varsayılan yok), `PAYTR_COMMISSION_PCT=0.03`.
- Secret adı kuralı: `^AI_KEY_[A-Z0-9_]+$`; `base_url` yalnız `https://`. Anthropic için geçiş süresince `AI_KEY_ANTHROPIC` yoksa `ANTHROPIC_API_KEY` okunur.
- Sağlayıcı çağrı zaman aşımı 90 sn; Anthropic SDK `maxRetries: 1`.
- Takvim ayı UTC (`ai_allowance()` ile aynı pencere).
- Testler: `pnpm test`. Edge function tip kontrolü Deno olmadığı için scratchpad `tsc` ile (bkz. Görev 14, Adım 1). Web: `pnpm typecheck`.
- Migration numarası 071 (yazım anında hiçbir dalda 071+ yok; commit öncesi `git fetch` ile tekrar kontrol).
- `db push`, function deploy ve secret ayarı yalnız bu oturumun sohbetinde kullanıcı onayıyla.

## Review Focus

1. Tablo okunamıyor ya da bir rota satırı silinmiş/bozuk modeli gösteriyor: AI durmamalı, koddaki varsayılan eşleme kullanılmalı (Görev 5 testleri `router: tablo hatası`, `router: kapalı model`).
2. Birinci model 429/5xx/zaman aşımı veriyor ve yedek yok: bugünkü hata davranışı aynen kalmalı, ikinci deneme yapılmamalı (Görev 5 `generate: yedek yoksa hata aynen`).
3. Bildirim aynı ay içinde eşzamanlı iki istekte: en fazla birkaç kopya kabul, ama push düşerse kilit geri alınmalı ki sonraki istek tekrar denesin (Görev 10 `notice: push düşerse kilit silinir`).
4. RevenueCat denemesi (`price: 0`) ve iade (`price < 0`): mevcut `net_monthly_usd` ezilmemeli (Görev 11 `net: deneme ve iade null döner`).
5. Eski istemciler: `ai-suggest` yanıtlarına eklenen `ai_mode` alanı yanıt gövdesi nesne değilse (dizi) eklenmemeli; `parse-meal` yanıtında `ai.error` alanı yine bulunmalı (`null`) (Görev 8 `index: ai_mode yalnız nesneye`, Görev 9 `parse-meal: ai alanı şekli`).

---

### Task 1: Migration 071 (tablolar, kolonlar, görünüm, ilk veri)

**Files:**
- Create: `supabase/migrations/071_ai_model_routing.sql`

**Interfaces:**
- Produces: tablolar `ai_models(id, provider, api_model, base_url, api_key_secret, input_per_mtok, output_per_mtok, cached_input_per_mtok, extra_params, enabled)`, `ai_model_routes(route, primary_model, fallback_model, updated_at)`; `subscriptions.net_monthly_usd`, `subscriptions.ai_budget_override_usd`; `events` adına `ai_fallback_notified`; görünüm `analytics.ai_route_health`.

- [ ] **Step 1: Canlı `events_name_check` tanımını oku** (yereldeki 040 ile farklı olabilir)

Run: `npx supabase db query --linked "select pg_get_constraintdef(oid) from pg_constraint where conname='events_name_check'"`
Expected: `CHECK (name IN ('paywall_view','ai_used', ...))`. Yeni kısıt bu listedeki her adı korur ve `ai_fallback_notified` ekler.

- [ ] **Step 2: Migration'ı yaz**

İçerik, spec 4.1 ve 4.3'teki kolonlar ve şu kurallarla:
- `provider CHECK (provider IN ('anthropic','openai_compat'))`, `api_key_secret CHECK (api_key_secret ~ '^AI_KEY_[A-Z0-9_]+$')`, `base_url CHECK (base_url IS NULL OR base_url ~ '^https://')`, `CHECK (provider <> 'openai_compat' OR base_url IS NOT NULL)`.
- `extra_params jsonb NOT NULL DEFAULT '{}'`, `enabled boolean NOT NULL DEFAULT true`.
- `ai_model_routes.primary_model` ve `fallback_model` `REFERENCES ai_models(id)`; `update_updated_at()` tetikleyicisi.
- İki tabloda RLS açık, politika yok; `REVOKE ALL ... FROM anon, authenticated`.
- Her şey idempotent (`IF NOT EXISTS`, `ON CONFLICT (id) DO NOTHING`, `DROP CONSTRAINT IF EXISTS` + yeniden ekleme).
- İlk veri (katalog, hepsi `anthropic`, `AI_KEY_ANTHROPIC`, `base_url` NULL):

| id | api_model | in | out | extra_params |
|---|---|---|---|---|
| opus-5 | claude-opus-5 | 5 | 25 | `{"output_config":{"effort":"low"}}` |
| opus-5-nothink | claude-opus-5 | 5 | 25 | `{"thinking":{"type":"disabled"}}` |
| sonnet-5 | claude-sonnet-5 | 2 | 10 | `{"output_config":{"effort":"low"}}` |
| sonnet-5-nothink | claude-sonnet-5 | 2 | 10 | `{"thinking":{"type":"disabled"}}` |
| opus-4-6 | claude-opus-4-6 | 5 | 25 | `{"temperature":0}` |

- Rotalar: spec 4.1'deki tablo (13 satır), birebir.
- `analytics.ai_route_health`: `events` içinde `name='ai_used'` satırlarından `date_trunc('month', created_at)`, `props->>'route'`, `props->>'model'`, `props->>'mode'` gruplarına göre `count(*)`, `sum/avg((props->>'cost_usd')::numeric)`, `avg(((props->>'parse_ok')::boolean)::int)`, `sum((props->>'text_chars')::numeric) / NULLIF(sum((props->>'output_tokens')::numeric),0)`. 052'deki `analytics.*` görünümleriyle aynı `GRANT`.

- [ ] **Step 3: Yerel PostgreSQL'de iki kez uygula** (bellek notu `local-postgres-migration-test`: scratchpad'de `initdb`, Supabase rol taklitleri, canlı şema DDL'i)

Run: `psql -p 54399 -U postgres -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/071_ai_model_routing.sql` (iki kez)
Expected: iki çalıştırma da hatasız; `select count(*) from ai_model_routes` → 13.

- [ ] **Step 4: Kısıt testleri**

Run (her biri hata vermeli): `insert into ai_models(id,provider,api_model,api_key_secret,input_per_mtok,output_per_mtok) values ('x','anthropic','m','SUPABASE_SERVICE_ROLE_KEY',1,1)`; aynı satır `api_key_secret='AI_KEY_X', provider='openai_compat', base_url='http://a'`; `insert into events(user_id,name) values (<uuid>,'ai_fallback_notified')` ise BAŞARILI olmalı.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/071_ai_model_routing.sql
git commit -m "feat(db): ai_models ve ai_model_routes tablolari, net gelir kolonlari"
```

### Task 2: LLM tipleri, maliyet ve varsayılan katalog

**Files:**
- Create: `supabase/functions/_shared/ai/llm/types.ts`, `supabase/functions/_shared/ai/llm/cost.ts`, `supabase/functions/_shared/ai/llm/defaults.ts`
- Test: `tests/functions/llmDefaults.test.ts`, `tests/functions/llmCost.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type AiRoute = 'daily_plan' | 'replan' | 'brain_dump' | 'task_priority' | 'workout_plan' | 'workout_program_chat' | 'nutrition_chat' | 'life_setup' | 'daily_report' | 'meal_extract' | 'meal_verify' | 'meal_portion' | 'meal_estimate'`
  - `const AI_ROUTES: readonly AiRoute[]`
  - `interface ModelSpec { id: string; provider: 'anthropic' | 'openai_compat'; apiModel: string; baseUrl: string | null; apiKeySecret: string; inputPerMtok: number; outputPerMtok: number; cachedInputPerMtok: number | null; extraParams: Record<string, unknown> }`
  - `interface ResolvedModel extends ModelSpec { apiKey: string }`
  - `interface LlmTool { name: string; description: string; schema: Record<string, unknown>; strict?: boolean }`
  - `interface LlmRequest { system: string | SystemBlock[]; messages: AnthropicMessage[]; maxTokens: number; tool?: LlmTool }` (`SystemBlock`, `AnthropicMessage`: `_shared/ai/coach.ts`)
  - `interface LlmUsage { input: number; output: number; cacheRead: number; cacheWrite: number }`
  - `interface ProviderResult { text: string; toolInput: Record<string, unknown> | null; usage: LlmUsage; stopReason: 'end' | 'max_tokens' | 'tool' }`
  - `interface LlmResult extends ProviderResult { route: AiRoute; modelId: string; apiModel: string; costUsd: number; mode: 'primary' | 'fallback' }`
  - `class LlmError extends Error { status: number | null; retryable: boolean }`
  - `type LlmCall = (request: LlmRequest) => Promise<LlmResult>`
- Produces (`cost.ts`): `costUsd(model: ModelSpec, usage: LlmUsage): number`
- Produces (`defaults.ts`): `DEFAULT_MODELS: readonly ModelSpec[]` (Task 1 kataloğu), `DEFAULT_ROUTES: Readonly<Record<AiRoute, { primary: string; fallback: string | null }>>` (Task 1 rotaları)

- [ ] **Step 1: Testleri yaz**

```ts
test('defaults: her rota tanımlı ve modelleri katalogda', () => {
  assert.deepEqual(Object.keys(DEFAULT_ROUTES).sort(), [...AI_ROUTES].sort())
  const ids = new Set(DEFAULT_MODELS.map((m) => m.id))
  for (const r of AI_ROUTES) {
    assert.ok(ids.has(DEFAULT_ROUTES[r].primary), r)
    const fb = DEFAULT_ROUTES[r].fallback
    if (fb) assert.ok(ids.has(fb), r)
  }
})
test('defaults: migration 071 ilk verisiyle aynı', () => {
  const sql = readFileSync('supabase/migrations/071_ai_model_routing.sql', 'utf8')
  for (const r of AI_ROUTES) {
    const { primary, fallback } = DEFAULT_ROUTES[r]
    assert.match(sql, new RegExp(`\\('${r}',\\s*'${primary}',\\s*${fallback ? `'${fallback}'` : 'NULL'}\\)`), r)
  }
})
test('cost: anthropic önbellek yazma 1,25x, okuma 0,1x', () => {
  const opus = DEFAULT_MODELS.find((m) => m.id === 'opus-5')!
  // replan ortalaması (spec 3): 1105 girdi, 866 yazma, 99 okuma, 492 çıktı
  assert.equal(Math.round(costUsd(opus, { input: 1105, cacheWrite: 866, cacheRead: 99, output: 492 }) * 1e4) / 1e4, 0.0233)
})
test('cost: openai_compat önbellekli girdi, fiyatı yoksa normal girdi', () => {
  const base = DEFAULT_MODELS[0]!
  const m: ModelSpec = { ...base, provider: 'openai_compat', inputPerMtok: 1, outputPerMtok: 4, cachedInputPerMtok: null }
  assert.equal(costUsd(m, { input: 1_000_000, cacheRead: 1_000_000, cacheWrite: 0, output: 0 }), 2)
  assert.equal(costUsd({ ...m, cachedInputPerMtok: 0.25 }, { input: 0, cacheRead: 1_000_000, cacheWrite: 0, output: 0 }), 0.25)
})
```

Migration'daki rota satırları bu regex'e uyacak biçimde tek satırda yazılır: `('replan', 'opus-5', 'sonnet-5')`.

- [ ] **Step 2: Çalıştır, düştüğünü gör**

Run: `pnpm test -- --test-name-pattern "defaults|cost"`
Expected: FAIL (modüller yok)

- [ ] **Step 3: Üç dosyayı yaz**

`costUsd`: anthropic için `(input*in + cacheWrite*in*1.25 + cacheRead*in*0.1 + output*out)/1e6`; openai_compat için `(input*in + cacheRead*(cached ?? in) + output*out)/1e6`. OpenAI uyumlu sağlayıcılar `prompt_tokens` içinde önbellekli token'ı da sayar; adaptör (Task 4) `input`'u önbellek hariç verir.

- [ ] **Step 4: Testler geçer**

Run: `pnpm test -- --test-name-pattern "defaults|cost"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai/llm tests/functions/llmDefaults.test.ts tests/functions/llmCost.test.ts
git commit -m "feat(ai): LLM tipleri, maliyet hesabi ve varsayilan model katalogu"
```

### Task 3: Anthropic adaptörü ve Node'da `npm:` çözümü

**Files:**
- Create: `supabase/functions/_shared/ai/llm/providers/anthropic.ts`
- Modify: `tests/support/ts-resolve.mjs` (`npm:<paket>` → `<paket>`), `package.json` (`devDependencies` içine `@anthropic-ai/sdk`, `node_modules`'taki sürümle aynı)
- Test: `tests/functions/llmAnthropic.test.ts`

**Interfaces:**
- Consumes: Task 2 tipleri.
- Produces: `callAnthropic(model: ResolvedModel, request: LlmRequest, deps?: { create?: (body: Record<string, unknown>) => Promise<unknown> }): Promise<ProviderResult>`. `deps.create` verilmezse `new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 }).messages.create`.

- [ ] **Step 1: Testleri yaz** (`deps.create` sahtesi gönderilen gövdeyi yakalar)

- `anthropic: gövde` → `{ model: 'claude-opus-5', max_tokens: 100, system, messages, output_config: { effort: 'low' } }` (`opus-5` extraParams birleşmiş); `SystemBlock[]` olduğu gibi gider.
- `anthropic: araç` → `tools: [{ name, description, input_schema: schema, strict: true }]`, `tool_choice: { type: 'tool', name }`; yanıtta `tool_use` bloğu → `toolInput` o nesne, `stopReason: 'tool'`.
- `anthropic: kullanım` → `{ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 }` → `usage { input: 10, output: 5, cacheRead: 3, cacheWrite: 2 }`; `stop_reason: 'max_tokens'` → `'max_tokens'`; metin blokları birleşik `text`.
- `anthropic: hata sınıflandırma` → `{ status: 429 }` ve `{ status: 529 }` fırlatan sahte → `LlmError` `retryable: true`; `{ status: 400 }` → `retryable: false`; durumsuz hata (ağ) → `retryable: true, status: null`.
- `resolver: npm: öneki` → `await import('npm:@anthropic-ai/sdk')` hata vermez.

- [ ] **Step 2: Düştüğünü gör**

Run: `pnpm test -- --test-name-pattern "anthropic|resolver"`
Expected: FAIL

- [ ] **Step 3: Adaptörü ve çözümleyici eşlemesini yaz**

Gövde sırası: `{ model: apiModel, max_tokens, system, messages, ...tools, ...extraParams }`. `extraParams` en son birleşir (katalog son sözü söyler).

- [ ] **Step 4: Geçtiğini gör**

Run: `pnpm test -- --test-name-pattern "anthropic|resolver"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai/llm/providers/anthropic.ts tests/support/ts-resolve.mjs package.json pnpm-lock.yaml tests/functions/llmAnthropic.test.ts
git commit -m "feat(ai): Anthropic adaptoru; testlerde npm: onekini coz"
```

### Task 4: OpenAI uyumlu adaptör

**Files:**
- Create: `supabase/functions/_shared/ai/llm/providers/openaiCompat.ts`
- Test: `tests/functions/llmOpenaiCompat.test.ts`

**Interfaces:**
- Produces: `callOpenAiCompat(model: ResolvedModel, request: LlmRequest, fetchImpl?: typeof fetch): Promise<ProviderResult>`

- [ ] **Step 1: Testleri yaz** (sahte `fetch` URL, başlık ve gövdeyi yakalar)

- `openai: istek` → URL `${baseUrl}/chat/completions`, `Authorization: Bearer <apiKey>`, gövde `{ model, max_tokens, messages: [{ role: 'system', content: 'SABIT\n\nDEGISKEN' }, ...messages], ...extraParams }` (`SystemBlock[]` metinleri sırayla `\n\n` ile birleşir).
- `openai: araç` → `tools: [{ type: 'function', function: { name, description, parameters: schema, strict: true } }]`, `tool_choice: { type: 'function', function: { name } }`; yanıt `tool_calls[0].function.arguments = '{"a":1}'` → `toolInput { a: 1 }`, `stopReason 'tool'`; bozuk JSON → `toolInput null`.
- `openai: kullanım` → `{ prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 40 } }` → `usage { input: 60, cacheRead: 40, cacheWrite: 0, output: 20 }`; `finish_reason: 'length'` → `'max_tokens'`.
- `openai: hata` → HTTP 429 ve 503 → `LlmError retryable true`; 400 → `false`; `fetch` fırlatırsa (ağ, `AbortSignal.timeout(90_000)`) → `retryable true, status null`.

- [ ] **Step 2: Düştüğünü gör**

Run: `pnpm test -- --test-name-pattern "openai"`
Expected: FAIL

- [ ] **Step 3: Adaptörü yaz** (`fetch` + `AbortSignal.timeout(90_000)`, SDK yok)

- [ ] **Step 4: Geçtiğini gör**

Run: `pnpm test -- --test-name-pattern "openai"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai/llm/providers/openaiCompat.ts tests/functions/llmOpenaiCompat.test.ts
git commit -m "feat(ai): OpenAI uyumlu genel adaptor"
```

### Task 5: Router ve `generate()`

**Files:**
- Create: `supabase/functions/_shared/ai/llm/router.ts`, `supabase/functions/_shared/ai/llm/generate.ts`, `supabase/functions/_shared/ai/llm/index.ts` (barrel)
- Test: `tests/functions/llmRouter.test.ts`, `tests/functions/llmGenerate.test.ts`

**Interfaces:**
- Consumes: Task 2 tipleri ve varsayılanlar, Task 3 ve 4 adaptörleri.
- Produces:
  - `interface CatalogRows { models: AiModelRow[]; routes: AiRouteRow[] }` (snake_case DB satırları)
  - `interface RouteModels { primary: ResolvedModel; fallback: ResolvedModel | null }`
  - `interface AiRouter { resolve(route: AiRoute): Promise<RouteModels> }`
  - `createRouter(deps: { load: () => Promise<CatalogRows>; env: (name: string) => string | undefined; now?: () => number; ttlMs?: number }): AiRouter` (`ttlMs` varsayılan 60_000)
  - `getRouter(): AiRouter` (edge function tekili; service role istemcisiyle iki tabloyu okur, `Deno.env.get`)
  - `generate(router: AiRouter, route: AiRoute, request: LlmRequest, options: { overBudget: boolean; onResult?: (result: LlmResult) => void; providers?: Partial<Record<ModelSpec['provider'], (m: ResolvedModel, r: LlmRequest) => Promise<ProviderResult>>> }): Promise<LlmResult>`
  - `bindRoute(router: AiRouter, route: AiRoute, options: Omit<Parameters<typeof generate>[3], 'providers'>): LlmCall`

- [ ] **Step 1: Router testleri**

- `router: tablo satırı kazanır` → yüklenen rota `brain_dump → gemini-x` ise `resolve('brain_dump').primary.id === 'gemini-x'`, `apiKey` env'den.
- `router: 60 sn önbellek` → `load` iki `resolve` çağrısında 1 kez; `now` 60_001 ms ilerleyince 2 kez.
- `router: tablo hatası` → `load` fırlatır → `DEFAULT_ROUTES` eşlemesi döner; hata da 60 sn önbelleklenir.
- `router: kapalı model` → birinci model `enabled: false` ya da katalogda yok → o rotanın `DEFAULT_ROUTES` birinci modeli; yedek çözülemezse `fallback: null`.
- `router: secret adı` → `api_key_secret: 'SUPABASE_SERVICE_ROLE_KEY'` olan model hiç seçilmez (varsayılana düşer); env'de anahtarı olmayan model de seçilmez.
- `router: anthropic geçiş anahtarı` → `AI_KEY_ANTHROPIC` yok, `ANTHROPIC_API_KEY` var → `apiKey` ondan.

- [ ] **Step 2: Generate testleri** (sahte `providers`)

- `generate: bütçe içi birinci` → `mode 'primary'`, `modelId` birinci.
- `generate: bütçe aşımı yedek` → `overBudget: true` → yedek, `mode 'fallback'`; yedek `null` ise birinci, `mode 'primary'`.
- `generate: hata anında yedek` → birinci `LlmError(retryable)` fırlatır → yedek çağrılır, `mode 'fallback'`, `onResult` bir kez.
- `generate: yedek yoksa hata aynen` → retryable hata, yedek `null` → aynı hata nesnesi fırlar, ikinci çağrı yok; `retryable: false` hata da yedek denenmeden fırlar.
- `generate: maliyet` → `costUsd` = `costUsd(model, usage)`; `route` ve `apiModel` doldurulur.

- [ ] **Step 3: Düştüğünü gör**

Run: `pnpm test -- --test-name-pattern "router|generate"`
Expected: FAIL

- [ ] **Step 4: Yaz**

`getRouter` yükleyicisi: `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` ile `ai_models` ve `ai_model_routes` `select('*')`; hata varsa fırlat (router varsayılana düşer ve `console.error` yazar).

- [ ] **Step 5: Geçtiğini gör**

Run: `pnpm test -- --test-name-pattern "router|generate"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/ai/llm tests/functions/llmRouter.test.ts tests/functions/llmGenerate.test.ts
git commit -m "feat(ai): tablodan model secen router ve yedekli generate"
```

### Task 6: Maliyet defteri yeni alanlar

**Files:**
- Modify: `supabase/functions/_shared/ai/usage.ts` (`AiLedger`, `costUsd`, `pricePerMTok`, `MeteredMessage` kalkar)
- Test: `tests/functions/aiLedger.test.ts`

**Interfaces:**
- Consumes: `LlmResult` (Task 2).
- Produces: `AiLedger.add(result: LlmResult): void`, `AiLedger.mode(): 'primary' | 'fallback' | null`; `record()` kalkar (çağıranlar `add` + `flush`). Props'a eklenenler: `route` (kullanılan rotalar virgülle), `mode`, `text_chars`, `parse_ok` (`!failed`). `model` alanı `apiModel` adlarıyla (geçmiş satırlarla aynı biçim).

- [ ] **Step 1: Testleri güncelle/yaz**

- `ledger: yeni alanlar` → iki `add` (biri `mode: 'fallback'`, `text: 'abc'`, `toolInput: { a: 1 }`) → props `{ calls: 2, mode: 'fallback', text_chars: 3 + JSON.stringify({ a: 1 }).length, parse_ok: true, route: 'meal_extract,meal_verify', cost_usd: <iki costUsd toplamı, 6 hane> }`.
- `ledger: markFailed parse_ok false`; `stopReason 'max_tokens'` → `parse_ok: false`.
- `ledger: mode()` → hiç çağrı yoksa `null`; flush sonrası sıfırlanır.
- Mevcut rezervasyon ve yeniden deneme testleri `MeteredMessage` yerine `LlmResult` ile aynı beklentilerle geçer.

- [ ] **Step 2: Düştüğünü gör** → Run: `pnpm test -- --test-name-pattern "ledger"` → FAIL

- [ ] **Step 3: `AiLedger`'ı güncelle**

- [ ] **Step 4: Geçtiğini gör** → Run: `pnpm test -- --test-name-pattern "ledger"` → PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai/usage.ts tests/functions/aiLedger.test.ts
git commit -m "feat(ai): maliyet defterine rota, mod, gorunen cikti ve ayristirma alanlari"
```

### Task 7: Net gelire göre bütçe ve kötüye kullanım sınırı

**Files:**
- Modify: `supabase/functions/_shared/ai/usage.ts` (`monthlyBudgetUsd`, `resolveAiAccess`, sabitler)
- Test: `tests/functions/aiAccess.test.ts`

**Interfaces:**
- Produces: `resolveAiAccess` imzası ve `AiAccess` tipi değişmez. Sabitler: `BUDGET_SHARE`, `DEFAULT_BUDGET_USD`, `TRIAL_BUDGET_USD`, `ABUSE_CAP_USD` (Global Constraints değerleri). `MIN_BUDGET_USD` ve `HARD_CAP_FACTOR` kalkar.

- [ ] **Step 1: Testleri güncelle/yaz**

- `bütçe: override öncelikli` → `pro({ ai_budget_override_usd: 3, net_monthly_usd: 1 })`, `monthCost: 2.9` → `overBudget false`; `3` → `true`.
- `bütçe: net × 0,4` → `net_monthly_usd: 0.96`, `monthCost: 0.38` → `false`; `0.385` → `true`.
- `bütçe: net yoksa varsayılan 0,38` → `monthCost: 0.37` → `false`, `0.38` → `true`.
- `bütçe: deneme 0,5` → `period_type: 'trial', net_monthly_usd: 10`, `monthCost: 0.49` → `false`, `0.5` → `true`.
- `kötüye kullanım: 5 USD` → `monthCost: 4.99` → `allowed true, overBudget true`; `5` → `{ allowed: false, status: 429, code: 'ai_budget_exhausted' }` (deneme dahil).
- Eski `price_usd` tabanlı testler silinir; `price_usd` artık bütçeyi etkilemez (`pro({ price_usd: 120 })`, `monthCost: 0.38` → `overBudget true`).

- [ ] **Step 2: Düştüğünü gör** → Run: `pnpm test -- --test-name-pattern "bütçe|kötüye"` → FAIL

- [ ] **Step 3: Formülü yaz** (spec 4.3)

- [ ] **Step 4: Geçtiğini gör** → Run: `pnpm test` → PASS (tüm paket)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai/usage.ts tests/functions/aiAccess.test.ts
git commit -m "feat(ai): net gelire gore butce, sert sinir yerine kotuye kullanim siniri"
```

### Task 8: `ai-suggest` rotalarını `generate()`'e taşı

**Files:**
- Modify: `supabase/functions/ai-suggest/index.ts`, `request.ts`, `planning.ts`, `tasks.ts`, `workout.ts`, `nutrition.ts`, `lifeSetup.ts`, `dailyReport.ts`
- Delete: `supabase/functions/ai-suggest/model.ts` (`firstText` gerekmez; `CHAT_EFFORT` katalogda)
- Test: `tests/functions/aiSuggestRoutes.test.ts` ve rotaları kullanan diğer testler

**Interfaces:**
- Consumes: `bindRoute`, `getRouter`, `LlmCall` (Task 5); `AiLedger.add/mode/markFailed/flush` (Task 6).
- Produces: `RouteContext` içinde `client` ve `chatModel` yerine `generate: LlmCall`. Handler imzaları değişmez.

- [ ] **Step 1: Testleri güncelle**

Sahte bağlamda `client.messages.create` yerine `generate` sahtesi (`LlmResult` döner, isteği kaydeder). Yeni testler:
- `index: ai_mode yalnız nesneye` → `json({ a: 1 })` → gövde `{ a: 1, ai_mode: 'primary' }`; `json([1])` → `[1]`; çağrı olmadıysa alan eklenmez.
- `life_setup: max_tokens hak yakmaz` (mevcut davranış) `stopReason: 'max_tokens'` ile.
- Her rota için: ayrıştırıcı boş/geri dönüş sonucu verince `ledger.markFailed()` çağrılır (workout: `!result.message`; life_setup: `!proposal`; diğerleri: ayrıştırıcının `null` ya da boş dizi döndüğü dal).
- `generate` çağrısına giden `maxTokens` değerleri bugünküyle aynı (planning 1500/7500, tasks 2048/512, workout 4500/9000, nutrition 4500, lifeSetup 8000, dailyReport 3000).

- [ ] **Step 2: Düştüğünü gör** → Run: `pnpm test -- --test-name-pattern "ai-suggest|life_setup|daily_report|index"` → FAIL

- [ ] **Step 3: Taşı**

- `index.ts`: `new Anthropic` ve model seçimi kalkar; `route.generate = bindRoute(getRouter(), type, { overBudget: access.overBudget, onResult: (r) => ledger.add(r) })`. `json` sarmalayıcı `ai_mode` ekler (yalnız düz nesne gövde ve `ledger.mode() !== null`). Handler dönünce `await ledger.flush()`. `catch` içinde sıra: `ledger.markFailed()`, `await ledger.abandon()`, `await ledger.flush()`.
- Handler'lar: `client.messages.create({...})` → `generate({ system, messages, maxTokens })`; `firstText(response)` → `result.text`; `ledger.record(...)` satırları kalkar; `thinking`/`output_config` alanları kalkar (katalogda).

- [ ] **Step 4: Geçtiğini gör** → Run: `pnpm test` → PASS

- [ ] **Step 5: Commit**

```bash
git add -A supabase/functions/ai-suggest tests/functions
git commit -m "refactor(ai-suggest): model cagrilari generate uzerinden, ai_mode yanit alani"
```

### Task 9: Öğün adaptörleri ve `parse-meal`

**Files:**
- Create: `supabase/functions/_shared/nutrition/adapters/llm.ts`
- Delete: `supabase/functions/_shared/nutrition/adapters/anthropic.ts`
- Modify: `supabase/functions/parse-meal/index.ts`, `supabase/functions/_shared/nutrition/index.ts` (export'lar)
- Test: `tests/functions/nutritionLlmAdapters.test.ts`, `tests/functions/parseMealAi.test.ts`

**Interfaces:**
- Consumes: `LlmCall`, `bindRoute`, `getRouter`.
- Produces: `createLlmExtractor(call: LlmCall): Extractor`, `createLlmVerifier(call: LlmCall): Verifier`, `createLlmPortionEstimator(call: LlmCall): PortionEstimator`, `createLlmFoodEstimator(call: LlmCall): FoodEstimator`. Araç tanımları, promptlar, `EXTRACT_PROMPT_VERSION` ve ayrıştırma mantığı `anthropic.ts`'ten aynen taşınır; `sampling`/`thinking`/`supportsTemperature` kalkar (katalogda). `name` alanı `llm:<route>`.

- [ ] **Step 1: Adaptör testleri**

- `meal adapter: çıkarıcı aracı zorlar` → sahte `call`'a giden istekte `tool.name === EXTRACT_TOOL.name`, `maxTokens: 2048`; `toolInput { items: [{ phrase: 'yumurta', quantity: 2, ... }] }` → bir `ExtractedItem`.
- `meal adapter: araç yoksa hata` → `toolInput: null` → `'Çıkarıcı araç çağrısı döndürmedi'` fırlar (bugünkü davranış).
- `meal adapter: enjeksiyon modele gitmez` → `detectFlags` `injection` döndüren girdide `call` hiç çağrılmaz.
- Doğrulayıcı, gram ve yiyecek tahmini için birer mutlu yol testi (bugünkü `anthropic.ts` davranışıyla aynı çıktı).

- [ ] **Step 2: `parse-meal` testleri** (handler'ın model katmanı kararı ayrı, test edilebilir bir fonksiyona çıkarılır: `planMealAi(access: AiAccess, hasKey: boolean): { useModels: boolean; overBudget: boolean }`)

- `parse-meal: bütçe aşımı modelde kalır` → Pro, `overBudget: true` → `useModels true, overBudget true`.
- `parse-meal: 429 kural katmanı` → `allowed: false` (kötüye kullanım) → `useModels false`.
- `parse-meal: ai alanı şekli` → yanıttaki `ai` nesnesinde `pro`, `enabled`, `error`, `model`, `semantic` anahtarları bulunur; bütçe aşımında `error: null` (artık `'budget'` üretilmez).

- [ ] **Step 3: Düştüğünü gör** → Run: `pnpm test -- --test-name-pattern "meal adapter|parse-meal"` → FAIL

- [ ] **Step 4: Yaz**

`parse-meal/index.ts`: dört rol `bindRoute(getRouter(), 'meal_extract' | 'meal_verify' | 'meal_portion' | 'meal_estimate', { overBudget, onResult: (r) => ledger.add(r) })`. `budgetLimited` dalı, `DEFAULT_MODEL`, `DEFAULT_CHEAP_MODEL` ve `NUTRITION_*` env okumaları kalkar. Kural katmanı yalnız `useModels false` ya da iki model de düşüp hata fırlatınca (bugünkü `catch`).

- [ ] **Step 5: Geçtiğini gör** → Run: `pnpm test` → PASS; Run: `pnpm eval:nutrition` → bugünküyle aynı sonuç (deterministik hat değişmedi)

- [ ] **Step 6: Commit**

```bash
git add -A supabase/functions/_shared/nutrition supabase/functions/parse-meal tests/functions
git commit -m "refactor(parse-meal): model katmani generate uzerinden, butce asiminda yedek model"
```

### Task 10: Ayda bir kez yedek mod bildirimi

**Files:**
- Create: `supabase/functions/_shared/ai/fallbackNotice.ts`
- Modify: `supabase/functions/ai-suggest/index.ts`, `supabase/functions/parse-meal/index.ts`
- Test: `tests/functions/fallbackNotice.test.ts`

**Interfaces:**
- Consumes: `sendExpoPush`, `PushMessage` (`_shared/push.ts`).
- Produces: `notifyFallbackOnce(admin: NoticeClient, userId: string, lang: 'tr' | 'en', now?: Date): Promise<'sent' | 'skipped' | 'failed'>`; `fallbackNoticeCopy(lang: 'tr' | 'en', now: Date): { title: string; body: string }`. `NoticeClient` yapısal tip (`events` select/insert/delete, `push_tokens` select, `sendExpoPush`'un istediği delete).

Metin (spec 4.4, birebir):
- TR başlık `Hafif AI moduna geçtin`, gövde `Bu ayki hızlı AI kullanımın doldu. AI özelliklerin çalışmaya devam ediyor, ay sonuna kadar daha hafif bir modelle. Yenilenme: 1 {Ay}.`
- EN başlık `Switched to light AI mode`, gövde `Your fast AI allowance for this month is used up. Your AI features keep working with a lighter model until the end of the month. Renews: {Month} 1.`
- `{Ay}`: bir sonraki UTC ayının adı (`Ocak ... Aralık` / `January ... December`). Push `data: { type: 'ai_fallback' }`.

- [ ] **Step 1: Testleri yaz**

- `notice: metin` → `fallbackNoticeCopy('tr', new Date('2026-10-20T12:00:00Z')).body` `'Yenilenme: 1 Kasım.'` ile biter; `2026-12-31T23:00:00Z` → `'1 Ocak.'`; EN `'Renews: November 1.'`.
- `notice: ayda bir kez` → bu ay `ai_fallback_notified` satırı varsa `'skipped'`, `insert` ve push yok.
- `notice: ilk kez` → satır yok → `insert({ user_id, name: 'ai_fallback_notified' })` sonra kullanıcının her token'ına bir mesaj → `'sent'`.
- `notice: token yok` → satır yazılır, push yok, `'sent'` değil `'skipped'`.
- `notice: push düşerse kilit silinir` → `sendExpoPush` `{ sent: 0, failed: [t] }` → eklenen satır silinir, `'failed'`.
- `notice: hata fırlatmaz` → `events` select hata verir → `'failed'`, istisna yok.

- [ ] **Step 2: Düştüğünü gör** → Run: `pnpm test -- --test-name-pattern "notice"` → FAIL

- [ ] **Step 3: Yaz ve bağla**

Ay penceresi: `created_at >= <UTC ay başı ISO>`. Bağlama: `ai-suggest` ve `parse-meal`'de `access.allowed && access.overBudget && access.tier !== 'free'` ise service role istemcisiyle `await notifyFallbackOnce(...)`. Dil: `ai-suggest` için `lang`; `parse-meal` istek gövdesinde dil alanı yoksa `'tr'`.

- [ ] **Step 4: Geçtiğini gör** → Run: `pnpm test` → PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai/fallbackNotice.ts supabase/functions/ai-suggest/index.ts supabase/functions/parse-meal/index.ts tests/functions/fallbackNotice.test.ts
git commit -m "feat(ai): yedek moda geciste ayda bir push bildirimi"
```

### Task 11: RevenueCat webhook net gelir

**Files:**
- Create: `supabase/functions/revenuecat-webhook/net.ts`
- Modify: `supabase/functions/revenuecat-webhook/index.ts` (`RevenueCatEvent`'e `tax_percentage`, `commission_percentage`; upsert satırına `net_monthly_usd`)
- Test: `tests/functions/revenuecatNet.test.ts`

**Interfaces:**
- Produces: `netMonthlyUsd(event: { price?: number | null; tax_percentage?: number | null; commission_percentage?: number | null }, plan: 'pro_monthly' | 'pro_annual', defaults: { tax: number; commission: number }): number | null`

- [ ] **Step 1: Testleri yaz**

- `net: oranlarla aylık` → `price 4.99, tax 0, commission 0.15` → `4.2415` (yuvarlamasız karşılaştırma `Math.abs(x - 4.2415) < 1e-9`).
- `net: yıllık 12'ye bölünür` → `price 39.99, tax 0, commission 0.15, pro_annual` → `39.99 * 0.85 / 12`.
- `net: oran yoksa varsayılan` → `price 2.4, tax null, commission undefined`, defaults `{ tax: 0.167, commission: 0.15 }` → `2.4 * (1 - 0.167 - 0.15)`.
- `net: deneme ve iade null döner` → `price 0` → `null`; `price -4.99` → `null`; `price null` → `null`.

- [ ] **Step 2: Düştüğünü gör** → Run: `pnpm test -- --test-name-pattern "net:"` → FAIL

- [ ] **Step 3: Yaz ve bağla**: `null` dönerse satıra `net_monthly_usd` hiç yazılmaz (mevcut değer korunur); varsayılanlar `AI_DEFAULT_TAX_PCT`, `AI_DEFAULT_COMMISSION_PCT`.

- [ ] **Step 4: Geçtiğini gör** → Run: `pnpm test` → PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/revenuecat-webhook tests/functions/revenuecatNet.test.ts
git commit -m "feat(billing): RevenueCat webhook net aylik geliri yazar"
```

### Task 12: PayTR net gelir (web)

**Files:**
- Create: `apps/web/lib/paytrNet.ts`
- Modify: `apps/web/app/api/payment/notification/route.ts` (başarılı ödemede `net_monthly_usd`)
- Test: `tests/web/paytrNet.test.ts`

**Interfaces:**
- Produces: `paytrNetMonthlyUsd(totalAmountKurus: string, plan: 'pro_monthly' | 'pro_annual', env: { usdTry?: string; commissionPct?: string }): number | null`

- [ ] **Step 1: Testleri yaz**

- `paytr: aylık` → `'9990'`, `pro_monthly`, `{ usdTry: '42', commissionPct: '0.03' }` → `99.90 / 1.2 * 0.97 / 42`.
- `paytr: yıllık` → `'79000'`, `pro_annual` → `790 / 1.2 * 0.97 / 42 / 12`.
- `paytr: kur yoksa null` → `usdTry` boş ya da sayı değil → `null`; komisyon boşsa `0.03`.
- `paytr: bozuk tutar null` → `'abc'`, `'0'` → `null`.

- [ ] **Step 2: Düştüğünü gör** → Run: `pnpm test -- --test-name-pattern "paytr"` → FAIL

- [ ] **Step 3: Yaz ve bağla** (`process.env['AI_USD_TRY']`, `process.env['PAYTR_COMMISSION_PCT']`; `null` ise kolon yazılmaz)

- [ ] **Step 4: Geçtiğini gör** → Run: `pnpm test && pnpm typecheck` → PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/paytrNet.ts apps/web/app/api/payment/notification/route.ts tests/web/paytrNet.test.ts
git commit -m "feat(billing): PayTR odemesinde net aylik gelir"
```

### Task 13: Değerlendirme aracı

**Files:**
- Create: `scripts/ai-eval/run.ts`, `scripts/ai-eval/routes/task_priority.ts`, `scripts/ai-eval/routes/brain_dump.ts`, `scripts/ai-eval/fixtures/task_priority.json`, `scripts/ai-eval/fixtures/brain_dump.json`
- Modify: `package.json` (`"eval:ai": "node --no-warnings --experimental-strip-types --import ./tests/support/register.mjs scripts/ai-eval/run.ts"`), `scripts/nutrition-eval/run.ts` (`--model <id>` bayrağı)
- Test: `tests/scripts/aiEval.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_MODELS`, `callAnthropic`, `callOpenAiCompat`, `costUsd`; rotaların prompt kurucuları ve ayrıştırıcıları (`ai-suggest/tasks.ts` içindekiler ihraç edilir, gövdeleri değişmez).
- Produces: `interface RouteEval<F> { route: AiRoute; build(fixture: F): LlmRequest; check(result: LlmResult, fixture: F): { parsed: boolean; checks: Record<string, boolean> } }`; `runEval(options: { route: AiRoute; model: ModelSpec; baseline: ModelSpec; cases: unknown[]; call?: (m: ResolvedModel, r: LlmRequest) => Promise<ProviderResult> }): Promise<EvalReport>`; `EvalReport { parseRate, maxTokensRate, checkRates, avgCostUsd, p95Ms, thinkingRatio, pairs: { input, baseline, candidate }[] }`.

Kurallar: modeller `DEFAULT_MODELS` + isteğe bağlı `--catalog <json>` dosyasından; anahtarlar `process.env` `AI_KEY_*`. Fixture'lar sentetik Türkçe, rota başına en az 10 vaka, gerçek kullanıcı verisi yok. Rapor ve 10 çiftlik yan yana markdown `os.tmpdir()` altına yazılır, yol ekrana basılır. Geçme kuralı: aday ayrıştırma oranı ≥ referans − 0,02 ve her rota kontrolünde aday ≥ referans; sonuç satırı `PASS` / `FAIL`. Diğer rotaların `routes/*.ts` adaptörleri, o rotalar geçiş sırasına geldiğinde eklenir (spec 4.5 sırası).

- [ ] **Step 1: Test yaz** (sahte `call` ile, ağ yok)

- `eval: oranlar` → 10 vakada adayın 9'u ayrıştırılır, referansın 10'u → `parseRate 0.9 / 1.0`, sonuç `FAIL`; 10/10 → `PASS`.
- `eval: rapor geçici klasörde` → yazılan yol `os.tmpdir()` ile başlar.
- `eval: düşünme oranı` → `text_chars / output` ortalaması doğru.

- [ ] **Step 2: Düştüğünü gör** → Run: `pnpm test -- --test-name-pattern "eval:"` → FAIL

- [ ] **Step 3: Yaz** (`task_priority` kontrolleri: dört puan 1 ile 5 arasında tam sayı; `brain_dump`: çıkan görev sayısı fixture'daki `expect_count` ile ±1). `scripts/nutrition-eval/run.ts`: `--model <id>` verilirse kural çıkarıcı yerine `createLlmExtractor`, `createLlmVerifier`, `createLlmPortionEstimator` o modelle (`DEFAULT_MODELS` / `--catalog`, anahtar `process.env`) kurulur; bayrak yoksa bugünkü deterministik hat aynen çalışır ve çıktısı değişmez.

- [ ] **Step 4: Geçtiğini gör** → Run: `pnpm test` → PASS

- [ ] **Step 5: Canlı duman testi** (kullanıcının `AI_KEY_ANTHROPIC` yerel ortamında varsa)

Run: `pnpm eval:ai -- --route task_priority --model sonnet-5-nothink --baseline sonnet-5-nothink`
Expected: `PASS`, rapor yolu `os.tmpdir()` altında. Anahtar yoksa adım atlanır ve kullanıcıya söylenir.

- [ ] **Step 6: Commit**

```bash
git add scripts/ai-eval scripts/nutrition-eval/run.ts package.json tests/scripts/aiEval.test.ts supabase/functions/ai-suggest/tasks.ts
git commit -m "feat(scripts): AI rota degerlendirme araci ve beslenme eval'ine model bayragi"
```

### Task 14: Doğrulama ve yayın (kullanıcı onaylı adımlar)

**Files:** yok (operasyon). `pnpm db:types` çıktısı: `packages/shared/src/types/database.ts`.

- [ ] **Step 1: Edge function tip kontrolü**

Scratchpad'e bellek notu `edge-function-typecheck-gap`'teki tsconfig yazılır.
Run: `npx tsc -p <scratchpad>/tsconfig.json 2>&1 | grep -v "TS2307\|Cannot find name 'Deno'"`
Expected: bu dalda değişen dosyalarda hata yok.

- [ ] **Step 2: Tam test ve build** → Run: `pnpm test && pnpm typecheck && pnpm build` → PASS

- [ ] **Step 3: Migration dry-run, kullanıcı onayı, push**

Run: `npx supabase db push --dry-run` → yalnız `071_ai_model_routing.sql`. Onaydan sonra `echo Y | npx supabase db push`, ardından `pnpm db:types` ve `npx supabase db query --linked "select route, primary_model, fallback_model from ai_model_routes order by route"` → 13 satır. Tip dosyası commit edilir.

- [ ] **Step 4: Secret'lar (onaylı)**

`AI_KEY_ANTHROPIC` (mevcut anahtarın kopyası; kullanıcı kendisi girer, değer sohbete yazılmaz). Bütçe değişkenleri varsayılanla aynıysa set edilmez. Web ortamına `AI_USD_TRY`.

- [ ] **Step 5: Elle verilen hesapların bütçesi**

Kullanıcıya her hesap için tutar sorulur (tariikdevecii, kubranurakbaba, aysemelisdevecii), sonra `update subscriptions set ai_budget_override_usd=<tutar> where user_id=(select id from auth.users where email=<e-posta>)`.

- [ ] **Step 6: Deploy (onaylı)**

Run: `npx supabase functions deploy ai-suggest parse-meal revenuecat-webhook`; web deploy kullanıcının olağan yoluyla.
Doğrulama: bir AI isteğinden sonra `select props from events where name='ai_used' order by created_at desc limit 1` → `route`, `mode`, `text_chars`, `parse_ok` alanları dolu, `model` `claude-*`.

- [ ] **Step 7: Gemini kataloğu** (gizlilik politikası ve mağaza veri beyanı güncellendikten sonra)

Google'ın güncel model listesi ve fiyatları doğrulanır: `curl -s "https://generativelanguage.googleapis.com/v1beta/openai/models" -H "Authorization: Bearer $AI_KEY_GEMINI"`. Sonra `insert into ai_models (id, provider, api_model, base_url, api_key_secret, input_per_mtok, output_per_mtok, cached_input_per_mtok, extra_params) values ('gemini-flash-lite', 'openai_compat', '<doğrulanan ad>', 'https://generativelanguage.googleapis.com/v1beta/openai', 'AI_KEY_GEMINI', <fiyat>, <fiyat>, <fiyat>, '{}')` (ve `gemini-flash`). `AI_KEY_GEMINI` secret'ı ücretli katman anahtarıyla.

- [ ] **Step 8: İlk rota geçişi**

Run: `pnpm eval:ai -- --route task_priority --model gemini-flash-lite --baseline sonnet-5-nothink --catalog <scratchpad>/catalog.json` ve aynısı `brain_dump` için. `PASS` + kullanıcı yan yana çiftleri onaylarsa `update ai_model_routes set primary_model='gemini-flash-lite' where route in ('task_priority','brain_dump')`. Ertesi gün `select * from analytics.ai_route_health` ile `parse_ok` oranı kontrol edilir; düşüşte tek `update` ile geri alınır.
