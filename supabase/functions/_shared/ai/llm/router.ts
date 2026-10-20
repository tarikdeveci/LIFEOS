// supabase/functions/_shared/ai/llm/router.ts
//
// Rota -> model eslemesi. ai_models / ai_model_routes tablolarini 60 sn bellekte
// tutar. Tablo okunamazsa, bir satir bozuksa ya da modelin anahtari yoksa
// koddaki varsayilan esleme (defaults.ts) kullanilir: ayar hatasi AI'i durdurmaz.

import { DEFAULT_MODELS, DEFAULT_ROUTES } from './defaults.ts'
import { LlmError } from './types.ts'
import type { AiRoute, ModelSpec, ResolvedModel } from './types.ts'

export interface AiModelRow {
  id: string
  provider: string
  api_model: string
  base_url: string | null
  api_key_secret: string
  input_per_mtok: number | string
  output_per_mtok: number | string
  cached_input_per_mtok: number | string | null
  extra_params: unknown
  enabled: boolean
}

export interface AiRouteRow {
  route: string
  primary_model: string
  fallback_model: string | null
}

export interface CatalogRows {
  models: AiModelRow[]
  routes: AiRouteRow[]
}

export interface RouteModels {
  primary: ResolvedModel
  fallback: ResolvedModel | null
}

export interface AiRouter {
  resolve(route: AiRoute): Promise<RouteModels>
}

export interface RouterDeps {
  load: () => Promise<CatalogRows>
  env: (name: string) => string | undefined
  now?: () => number
  ttlMs?: number
}

const SECRET_PATTERN = /^AI_KEY_[A-Z0-9_]+$/
const DEFAULT_TTL_MS = 60_000

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Satiri dogrular; kapali ya da bozuksa null (varsayilana dusulur). */
function parseRow(row: AiModelRow): ModelSpec | null {
  if (!row.enabled) return null
  if (row.provider !== 'anthropic' && row.provider !== 'openai_compat') return null
  if (!SECRET_PATTERN.test(row.api_key_secret)) return null
  if (row.base_url !== null && !row.base_url.startsWith('https://')) return null
  if (row.provider === 'openai_compat' && row.base_url === null) return null
  const input = toNumber(row.input_per_mtok)
  const output = toNumber(row.output_per_mtok)
  if (input === null || output === null) return null
  const extra = row.extra_params
  const extraParams = typeof extra === 'object' && extra !== null && !Array.isArray(extra)
    ? (extra as Record<string, unknown>)
    : {}
  return {
    id: row.id,
    provider: row.provider,
    apiModel: row.api_model,
    baseUrl: row.base_url,
    apiKeySecret: row.api_key_secret,
    inputPerMtok: input,
    outputPerMtok: output,
    cachedInputPerMtok: toNumber(row.cached_input_per_mtok),
    extraParams,
  }
}

export function createRouter(deps: RouterDeps): AiRouter {
  const now = deps.now ?? (() => Date.now())
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS
  let cache: { at: number; pending: Promise<CatalogRows | null> } | null = null

  function readCatalog(): Promise<CatalogRows | null> {
    if (cache && now() - cache.at <= ttlMs) return cache.pending
    // Hata da onbelleklenir: tablo kapaliyken her istek yeniden denemesin.
    const pending = deps.load().then(
      (rows) => rows,
      (err: unknown) => {
        console.error('ai_models okunamadi, varsayilan esleme kullaniliyor:', err instanceof Error ? err.message : err)
        return null
      },
    )
    cache = { at: now(), pending }
    return pending
  }

  function apiKeyFor(spec: ModelSpec): string | null {
    const direct = deps.env(spec.apiKeySecret)
    if (direct) return direct
    // Gecis suresince: AI_KEY_ANTHROPIC yoksa eski secret.
    if (spec.apiKeySecret === 'AI_KEY_ANTHROPIC') return deps.env('ANTHROPIC_API_KEY') || null
    return null
  }

  function withKey(spec: ModelSpec | null | undefined): ResolvedModel | null {
    if (!spec) return null
    const apiKey = apiKeyFor(spec)
    return apiKey ? { ...spec, apiKey } : null
  }

  function defaultModel(id: string | null): ResolvedModel | null {
    if (id === null) return null
    return withKey(DEFAULT_MODELS.find((m) => m.id === id))
  }

  return {
    async resolve(route: AiRoute): Promise<RouteModels> {
      const catalog = await readCatalog()
      const defaults = DEFAULT_ROUTES[route]
      const row = catalog?.routes.find((r) => r.route === route) ?? null

      let primary: ResolvedModel | null = null
      let fallback: ResolvedModel | null = null
      if (catalog && row) {
        const specs = new Map<string, ModelSpec>()
        for (const m of catalog.models) {
          const spec = parseRow(m)
          if (spec) specs.set(spec.id, spec)
        }
        primary = withKey(specs.get(row.primary_model))
        fallback = row.fallback_model ? withKey(specs.get(row.fallback_model)) : null
      }
      if (!primary) {
        // Satir yok, tablo okunamadi ya da model kullanilamaz: koddaki esleme.
        primary = defaultModel(defaults.primary)
        fallback = defaultModel(defaults.fallback)
      }
      if (!primary) {
        throw new LlmError(`'${route}' rotasi icin model anahtari tanimli degil`, null, false)
      }
      return { primary, fallback }
    },
  }
}
