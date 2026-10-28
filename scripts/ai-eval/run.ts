// Rota kalitesi ölçümü: ucuz bir modele geçmeden önce adayı referans modelle
// aynı sentetik vakalarda karşılaştırır.
//
//   pnpm eval:ai -- --route task_priority --model <aday> --baseline <referans>
//   pnpm eval:ai -- --route brain_dump --model <aday> --catalog katalog.json --limit 5
//
// Modeller DEFAULT_MODELS ile isteğe bağlı --catalog dosyasından (ModelSpec dizisi,
// aynı id varsayılanı ezer) gelir; anahtarlar process.env içindeki AI_KEY_* değerleri.
// Geçme kuralı: aday ayrıştırma oranı >= referans - 0,02 ve her rota kontrolünde
// aday >= referans. Rapor ve yan yana markdown os.tmpdir() altına yazılır.

import { readFileSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { costUsd } from '../../supabase/functions/_shared/ai/llm/cost.ts'
import { DEFAULT_MODELS, DEFAULT_ROUTES } from '../../supabase/functions/_shared/ai/llm/defaults.ts'
import type {
  AiRoute,
  LlmCall,
  LlmRequest,
  LlmResult,
  ModelSpec,
  ProviderResult,
  ResolvedModel,
} from '../../supabase/functions/_shared/ai/llm/types.ts'
import { brainDumpEval } from './routes/brain_dump.ts'
import { taskPriorityEval } from './routes/task_priority.ts'

export interface RouteEval<F> {
  route: AiRoute
  /** Fixture satırını doğrular; bozuksa hata fırlatır. */
  fixture(raw: unknown): F
  build(fixture: F): LlmRequest
  check(result: LlmResult, fixture: F): { parsed: boolean; checks: Record<string, boolean> }
}

export type ProviderCall = (model: ResolvedModel, request: LlmRequest) => Promise<ProviderResult>

export interface Side {
  baseline: number
  candidate: number
}

export interface Outcome {
  text: string
  parsed: boolean
  checks: Record<string, boolean>
  stopReason: ProviderResult['stopReason'] | null
  outputTokens: number
  costUsd: number
  ms: number
  error: string | null
}

export interface EvalReport {
  route: AiRoute
  models: { baseline: string; candidate: string }
  cases: number
  parseRate: Side
  maxTokensRate: Side
  checkRates: Record<string, Side>
  avgCostUsd: Side
  p95Ms: Side
  thinkingRatio: Side
  verdict: 'PASS' | 'FAIL'
  pairs: { input: unknown; baseline: Outcome; candidate: Outcome }[]
}

export interface RunEvalOptions {
  route: AiRoute
  model: ModelSpec
  baseline: ModelSpec
  cases: unknown[]
  call?: ProviderCall
}

const ROUTE_EVALS: Partial<Record<AiRoute, RouteEval<unknown>>> = {
  task_priority: taskPriorityEval,
  brain_dump: brainDumpEval,
}

const PARSE_TOLERANCE = 0.02
const EPSILON = 1e-9
const SECRET_PATTERN = /^AI_KEY_[A-Z0-9_]+$/
const ANTHROPIC_SECRET = 'AI_KEY_ANTHROPIC'
/** Router ile aynı: gövdenin kimliğini belirleyen alanlar katalogdan ezilemez. */
const RESERVED_PARAMS = new Set(['model', 'messages', 'system', 'tools', 'tool_choice', 'stream', 'max_tokens'])

// ============================
// Modeller
// ============================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function price(id: string, field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${id}: ${field} sıfır ya da pozitif bir sayı olmalı`)
  }
  return value
}

function parseSpec(raw: unknown): ModelSpec {
  if (!isRecord(raw)) throw new Error('Katalog satırı nesne olmalı')
  const id = raw['id']
  if (typeof id !== 'string' || id === '') throw new Error('Katalog satırında id yok')
  const provider = raw['provider']
  if (provider !== 'anthropic' && provider !== 'openai_compat') throw new Error(`${id}: bilinmeyen sağlayıcı`)
  const apiModel = raw['apiModel']
  if (typeof apiModel !== 'string' || apiModel === '') throw new Error(`${id}: apiModel yok`)
  const baseUrl = raw['baseUrl'] ?? null
  if (baseUrl !== null && (typeof baseUrl !== 'string' || !baseUrl.startsWith('https://'))) {
    throw new Error(`${id}: baseUrl yalnız https:// olabilir`)
  }
  if (provider === 'openai_compat' && baseUrl === null) throw new Error(`${id}: openai_compat için baseUrl gerekli`)
  const secret = raw['apiKeySecret']
  if (typeof secret !== 'string' || !SECRET_PATTERN.test(secret)) {
    throw new Error(`${id}: apiKeySecret AI_KEY_ ile başlayan büyük harfli bir ad olmalı`)
  }
  if (provider === 'openai_compat' && secret === ANTHROPIC_SECRET) {
    throw new Error(`${id}: Anthropic anahtarı başka bir adrese gönderilmez`)
  }
  const cached = raw['cachedInputPerMtok'] ?? null
  const extraParams: Record<string, unknown> = {}
  const extra = raw['extraParams']
  if (isRecord(extra)) {
    for (const [key, value] of Object.entries(extra)) {
      if (!RESERVED_PARAMS.has(key)) extraParams[key] = value
    }
  }
  return {
    id,
    provider,
    apiModel,
    baseUrl,
    apiKeySecret: secret,
    inputPerMtok: price(id, 'inputPerMtok', raw['inputPerMtok']),
    outputPerMtok: price(id, 'outputPerMtok', raw['outputPerMtok']),
    cachedInputPerMtok: cached === null ? null : price(id, 'cachedInputPerMtok', cached),
    extraParams,
  }
}

/** DEFAULT_MODELS ile katalog satırlarını birleştirir; aynı id katalogdaki ile ezilir. */
export function loadModels(catalog: unknown = []): ModelSpec[] {
  if (!Array.isArray(catalog)) throw new Error('Katalog bir model dizisi olmalı')
  const byId = new Map<string, ModelSpec>(DEFAULT_MODELS.map((m) => [m.id, m]))
  for (const row of catalog) {
    const spec = parseSpec(row)
    byId.set(spec.id, spec)
  }
  return [...byId.values()]
}

/** Anahtar process.env'den; router gibi AI_KEY_ANTHROPIC yoksa ANTHROPIC_API_KEY okunur. */
export function resolveModel(spec: ModelSpec, env: NodeJS.ProcessEnv = process.env): ResolvedModel {
  const direct = env[spec.apiKeySecret]
  const legacy = spec.apiKeySecret === ANTHROPIC_SECRET ? env['ANTHROPIC_API_KEY'] : undefined
  return { ...spec, apiKey: direct || legacy || '' }
}

/** Gerçek sağlayıcı çağrısı. Adaptörler yalnız burada yüklenir: testler ağa çıkmaz. */
export async function providerCall(model: ResolvedModel, request: LlmRequest): Promise<ProviderResult> {
  if (!model.apiKey) throw new Error(`${model.apiKeySecret} ortamda tanımlı değil`)
  if (model.provider === 'anthropic') {
    const { callAnthropic } = await import('../../supabase/functions/_shared/ai/llm/providers/anthropic.ts')
    return callAnthropic(model, request)
  }
  const { callOpenAiCompat } = await import('../../supabase/functions/_shared/ai/llm/providers/openaiCompat.ts')
  return callOpenAiCompat(model, request)
}

/** Tek modele bağlı LlmCall: generate() gibi sonuca rota, maliyet ve mod ekler, yedek yoktur. */
export function bindModel(model: ResolvedModel, route: AiRoute, call: ProviderCall = providerCall): LlmCall {
  return async (request) => {
    const result = await call(model, request)
    return {
      ...result,
      route,
      modelId: model.id,
      apiModel: model.apiModel,
      costUsd: costUsd(model, result.usage),
      mode: 'primary',
    }
  }
}

// ============================
// Ölçüm
// ============================

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length
}

async function measure<F>(
  routeEval: RouteEval<F>,
  model: ResolvedModel,
  fixture: F,
  call: ProviderCall,
): Promise<Outcome> {
  const started = performance.now()
  try {
    const result = await bindModel(model, routeEval.route, call)(routeEval.build(fixture))
    const ms = performance.now() - started
    const { parsed, checks } = routeEval.check(result, fixture)
    return {
      text: result.text,
      parsed,
      checks,
      stopReason: result.stopReason,
      outputTokens: result.usage.output,
      costUsd: result.costUsd,
      ms,
      error: null,
    }
  } catch (err) {
    // Hata veren çağrı ayrıştırılamamış sayılır; ölçüm diğer vakalarla sürer.
    return {
      text: '',
      parsed: false,
      checks: {},
      stopReason: null,
      outputTokens: 0,
      costUsd: 0,
      ms: performance.now() - started,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function rate(outcomes: Outcome[], test: (o: Outcome) => boolean): number {
  return outcomes.length === 0 ? 0 : outcomes.filter(test).length / outcomes.length
}

function sides(baseline: Outcome[], candidate: Outcome[], stat: (outcomes: Outcome[]) => number): Side {
  return { baseline: stat(baseline), candidate: stat(candidate) }
}

/** Görünür metin karakteri / çıktı token'ı: düşük oran, çıktının çoğunun düşünmeye gittiğini gösterir. */
function thinkingRatio(outcomes: Outcome[]): number {
  return mean(outcomes.filter((o) => o.outputTokens > 0).map((o) => o.text.length / o.outputTokens))
}

export async function runEval(options: RunEvalOptions): Promise<EvalReport> {
  const routeEval = ROUTE_EVALS[options.route]
  if (!routeEval) throw new Error(`'${options.route}' rotası için değerlendirme yok`)
  const call = options.call ?? providerCall
  const baselineModel = resolveModel(options.baseline)
  const candidateModel = resolveModel(options.model)

  const pairs: EvalReport['pairs'] = []
  for (const raw of options.cases) {
    const fixture = routeEval.fixture(raw)
    // Sıralı: sağlayıcı hız sınırına takılmasın, gecikme ölçümü birbirini etkilemesin.
    const baseline = await measure(routeEval, baselineModel, fixture, call)
    const candidate = await measure(routeEval, candidateModel, fixture, call)
    pairs.push({ input: raw, baseline, candidate })
  }

  const base = pairs.map((p) => p.baseline)
  const cand = pairs.map((p) => p.candidate)
  const checkNames = new Set<string>()
  for (const o of [...base, ...cand]) for (const name of Object.keys(o.checks)) checkNames.add(name)
  const checkRates: Record<string, Side> = {}
  for (const name of checkNames) {
    checkRates[name] = sides(base, cand, (os) => rate(os, (o) => o.checks[name] === true))
  }
  const parseRate = sides(base, cand, (os) => rate(os, (o) => o.parsed))

  const parseOk = parseRate.candidate + EPSILON >= parseRate.baseline - PARSE_TOLERANCE
  const checksOk = Object.values(checkRates).every((s) => s.candidate + EPSILON >= s.baseline)

  return {
    route: options.route,
    models: { baseline: options.baseline.id, candidate: options.model.id },
    cases: pairs.length,
    parseRate,
    maxTokensRate: sides(base, cand, (os) => rate(os, (o) => o.stopReason === 'max_tokens')),
    checkRates,
    avgCostUsd: sides(base, cand, (os) => mean(os.map((o) => o.costUsd))),
    p95Ms: sides(base, cand, (os) => quantile(os.map((o) => o.ms), 0.95)),
    thinkingRatio: sides(base, cand, thinkingRatio),
    verdict: parseOk && checksOk ? 'PASS' : 'FAIL',
    pairs,
  }
}

// ============================
// Rapor
// ============================

const SIDE_BY_SIDE = 10
const CELL_LIMIT = 1500

function cell(text: string): string {
  const clipped = text.length > CELL_LIMIT ? `${text.slice(0, CELL_LIMIT)}...` : text
  return clipped.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>') || '(boş)'
}

function outcomeCell(o: Outcome): string {
  if (o.error) return cell(`HATA: ${o.error}`)
  const failed = Object.entries(o.checks).filter(([, ok]) => !ok).map(([name]) => name)
  const status = `${o.parsed ? 'ayrıştı' : 'ayrışmadı'}${failed.length > 0 ? `, düşen: ${failed.join(', ')}` : ''}`
  return `${cell(status)}<br><br>${cell(o.text)}`
}

function fmt(value: number, digits: number): string {
  return value.toFixed(digits)
}

export function summaryRows(report: EvalReport): [string, Side, number][] {
  return [
    ['ayrıştırma oranı', report.parseRate, 3],
    ['max_tokens oranı', report.maxTokensRate, 3],
    ...Object.entries(report.checkRates).map(([name, s]): [string, Side, number] => [`kontrol: ${name}`, s, 3]),
    ['ortalama maliyet (USD)', report.avgCostUsd, 6],
    ['gecikme p95 (ms)', report.p95Ms, 0],
    ['metin karakteri / çıktı token', report.thinkingRatio, 2],
  ]
}

export function toMarkdown(report: EvalReport): string {
  const lines = [
    `# AI rota değerlendirmesi: ${report.route}`,
    '',
    `Referans: \`${report.models.baseline}\`, aday: \`${report.models.candidate}\`, ${report.cases} vaka.`,
    '',
    `Sonuç: **${report.verdict}**`,
    '',
    '| Ölçü | Referans | Aday |',
    '| --- | --- | --- |',
    ...summaryRows(report).map(([label, s, d]) => `| ${label} | ${fmt(s.baseline, d)} | ${fmt(s.candidate, d)} |`),
    '',
    `## İlk ${Math.min(SIDE_BY_SIDE, report.pairs.length)} vaka yan yana`,
    '',
  ]
  report.pairs.slice(0, SIDE_BY_SIDE).forEach((pair, i) => {
    lines.push(
      `### Vaka ${i + 1}`,
      '',
      '```json',
      JSON.stringify(pair.input, null, 2),
      '```',
      '',
      '| Referans | Aday |',
      '| --- | --- |',
      `| ${outcomeCell(pair.baseline)} | ${outcomeCell(pair.candidate)} |`,
      '',
    )
  })
  return lines.join('\n')
}

export async function writeReport(report: EvalReport): Promise<{ dir: string; json: string; markdown: string }> {
  const dir = await mkdtemp(join(tmpdir(), `lifeos-ai-eval-${report.route}-`))
  const json = join(dir, 'report.json')
  const markdown = join(dir, 'pairs.md')
  await writeFile(json, JSON.stringify(report, null, 2), 'utf8')
  await writeFile(markdown, toMarkdown(report), 'utf8')
  return { dir, json, markdown }
}

// ============================
// Komut satırı
// ============================

interface Args {
  route: string | null
  model: string | null
  baseline: string | null
  catalog: string | null
  limit: number | null
}

function parseArgs(argv: string[]): Args {
  const args: Args = { route: null, model: null, baseline: null, catalog: null, limit: null }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (value === undefined) continue
    if (flag === '--route') { args.route = value; i++ }
    else if (flag === '--model') { args.model = value; i++ }
    else if (flag === '--baseline') { args.baseline = value; i++ }
    else if (flag === '--catalog') { args.catalog = resolve(process.cwd(), value); i++ }
    else if (flag === '--limit') { args.limit = Number.parseInt(value, 10); i++ }
  }
  return args
}

/** --catalog dosyasını okuyup varsayılanlarla birleştirir. */
export function readCatalog(path: string | null): ModelSpec[] {
  return loadModels(path ? (JSON.parse(readFileSync(path, 'utf8')) as unknown) : [])
}

function isRoute(value: string): value is AiRoute {
  return value in DEFAULT_ROUTES
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const routes = Object.keys(ROUTE_EVALS).join(', ')
  if (!args.route || !isRoute(args.route) || !ROUTE_EVALS[args.route]) {
    console.error(`--route gerekli; değerlendirmesi olan rotalar: ${routes}`)
    process.exit(2)
  }
  const route = args.route
  if (!args.model) {
    console.error('--model <aday id> gerekli')
    process.exit(2)
  }
  const models = readCatalog(args.catalog)
  const find = (id: string): ModelSpec => {
    const spec = models.find((m) => m.id === id)
    if (!spec) {
      console.error(`Model bulunamadı: ${id}. Bilinenler: ${models.map((m) => m.id).join(', ')}`)
      process.exit(2)
    }
    return spec
  }
  const model = find(args.model)
  const baseline = find(args.baseline ?? DEFAULT_ROUTES[route].primary)
  for (const spec of [model, baseline]) {
    if (!resolveModel(spec).apiKey) {
      console.error(`${spec.id} için ${spec.apiKeySecret} ortamda tanımlı değil`)
      process.exit(2)
    }
  }

  const fixturePath = fileURLToPath(new URL(`./fixtures/${route}.json`, import.meta.url))
  const all = JSON.parse(readFileSync(fixturePath, 'utf8')) as unknown
  if (!Array.isArray(all)) throw new Error(`${fixturePath} bir dizi olmalı`)
  const cases = args.limit && args.limit > 0 ? all.slice(0, args.limit) : all

  console.log(`\nLifeOS AI değerlendirmesi: ${route}, ${cases.length} vaka`)
  console.log(`Referans: ${baseline.id} (${baseline.apiModel}) · aday: ${model.id} (${model.apiModel})\n`)

  const report = await runEval({ route, model, baseline, cases })
  console.log(`  ${'ölçü'.padEnd(32)} ${'referans'.padStart(12)} ${'aday'.padStart(12)}`)
  for (const [label, s, d] of summaryRows(report)) {
    console.log(`  ${label.padEnd(32)} ${fmt(s.baseline, d).padStart(12)} ${fmt(s.candidate, d).padStart(12)}`)
  }
  const errors = report.pairs.flatMap((p) => [p.baseline.error, p.candidate.error]).filter((e) => e !== null)
  if (errors.length > 0) console.log(`\n  ${errors.length} çağrı hata verdi, ilki: ${errors[0]}`)

  const paths = await writeReport(report)
  console.log(`\nRapor: ${paths.json}`)
  console.log(`Yan yana: ${paths.markdown}`)
  console.log(`\n${report.verdict}`)
  process.exit(report.verdict === 'PASS' ? 0 : 1)
}

const entry = process.argv[1]
if (entry && resolve(entry) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error('Değerlendirme hatası:', error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
