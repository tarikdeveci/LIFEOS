// supabase/functions/_shared/ai/llm/providers/anthropic.ts
//
// Anthropic adaptoru. SDK import'u yalniz bu dosyada.

import Anthropic from 'npm:@anthropic-ai/sdk'

import { LlmError } from '../types.ts'
import type { LlmRequest, LlmUsage, ProviderResult, ResolvedModel } from '../types.ts'

const TIMEOUT_MS = 90_000

export interface AnthropicDeps {
  create?: (body: Record<string, unknown>) => Promise<unknown>
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function isCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function buildBody(model: ResolvedModel, request: LlmRequest): Record<string, unknown> {
  const tools = request.tool
    ? {
        tools: [{
          name: request.tool.name,
          description: request.tool.description,
          input_schema: request.tool.schema,
          ...(request.tool.strict ? { strict: true } : {}),
        }],
        tool_choice: { type: 'tool', name: request.tool.name },
      }
    : {}
  // extraParams en son birlesir; ayrilmis alanlar router'da (parseRow) ayiklanir.
  return {
    model: model.apiModel,
    max_tokens: request.maxTokens,
    system: request.system,
    messages: request.messages,
    ...tools,
    ...model.extraParams,
  }
}

function classify(err: unknown): LlmError {
  // Adaptorun kendi hatasi (kullanim bilgisi dahil) oldugu gibi gecer.
  if (err instanceof LlmError) return err
  const status = typeof record(err)['status'] === 'number' ? (record(err)['status'] as number) : null
  const message = err instanceof Error ? err.message : 'Anthropic cagrisi basarisiz'
  // Durum yoksa ag ya da zaman asimi; 429 ve 5xx (529 asiri yuk dahil) gecici.
  const retryable = status === null || status === 429 || status >= 500
  return new LlmError(message, status, retryable)
}

function toUsage(usage: Record<string, unknown>): LlmUsage {
  return {
    input: count(usage['input_tokens']),
    output: count(usage['output_tokens']),
    cacheRead: count(usage['cache_read_input_tokens']),
    cacheWrite: count(usage['cache_creation_input_tokens']),
  }
}

function parse(response: unknown): ProviderResult {
  const body = record(response)
  const usage = record(body['usage'])
  // Eksik icerik ya da kullanim sifir maliyetli basari sayilmaz: gecici hata, yedek calissin.
  const usageValid = isCount(usage['input_tokens']) && isCount(usage['output_tokens'])
  if (!Array.isArray(body['content']) || !usageValid) {
    // Kullanim gecerliyse harcama gercek: hata bunu tasir, defter yazar.
    throw new LlmError(
      'Anthropic yaniti gecersiz: icerik ya da kullanim eksik',
      null,
      true,
      usageValid ? toUsage(usage) : null,
    )
  }
  const blocks = body['content'].map(record)
  const text = blocks
    .filter((b) => b['type'] === 'text' && typeof b['text'] === 'string')
    .map((b) => b['text'] as string)
    .join('')
  const toolBlock = blocks.find((b) => b['type'] === 'tool_use')
  const input = toolBlock ? record(toolBlock['input']) : null
  const stop = body['stop_reason']
  return {
    text,
    toolInput: input,
    usage: toUsage(usage),
    stopReason: stop === 'max_tokens' ? 'max_tokens' : stop === 'tool_use' ? 'tool' : 'end',
  }
}

export async function callAnthropic(
  model: ResolvedModel,
  request: LlmRequest,
  deps: AnthropicDeps = {},
): Promise<ProviderResult> {
  const create = deps.create
    ?? ((body: Record<string, unknown>) => {
      const client = new Anthropic({ apiKey: model.apiKey, timeout: TIMEOUT_MS, maxRetries: 1 })
      // Govde katalogdan gelen serbest parametreler icerir; SDK tipine dar daraltilamaz.
      return client.messages.create(body as unknown as Parameters<typeof client.messages.create>[0])
    })
  try {
    return parse(await create(buildBody(model, request)))
  } catch (err) {
    throw classify(err)
  }
}
