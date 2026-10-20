// supabase/functions/_shared/ai/llm/providers/openaiCompat.ts
//
// OpenAI uyumlu genel adaptor (Gemini, Kimi, DeepSeek, OpenRouter...). SDK yok,
// `fetch` ile `{base_url}/chat/completions`.

import { LlmError } from '../types.ts'
import type { LlmRequest, LlmUsage, ProviderResult, ResolvedModel } from '../types.ts'

const TIMEOUT_MS = 90_000

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function isCount(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Sabit blok once gelir: otomatik onek onbellegi sabit metne denk dussun. */
function systemText(system: LlmRequest['system']): string {
  return typeof system === 'string' ? system : system.map((b) => b.text).join('\n\n')
}

function buildBody(model: ResolvedModel, request: LlmRequest): Record<string, unknown> {
  const tools = request.tool
    ? {
        tools: [{
          type: 'function',
          function: {
            name: request.tool.name,
            description: request.tool.description,
            parameters: request.tool.schema,
            ...(request.tool.strict ? { strict: true } : {}),
          },
        }],
        tool_choice: { type: 'function', function: { name: request.tool.name } },
      }
    : {}
  return {
    model: model.apiModel,
    max_tokens: request.maxTokens,
    messages: [{ role: 'system', content: systemText(request.system) }, ...request.messages],
    ...tools,
    ...model.extraParams,
  }
}

function parseToolArguments(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function toUsage(raw: Record<string, unknown>): LlmUsage {
  const cached = count(record(raw['prompt_tokens_details'])['cached_tokens'])
  return {
    input: Math.max(0, count(raw['prompt_tokens']) - cached),
    output: count(raw['completion_tokens']),
    cacheRead: cached,
    cacheWrite: 0,
  }
}

function parse(response: unknown): ProviderResult {
  const body = record(response)
  const choice = record(Array.isArray(body['choices']) ? body['choices'][0] : null)
  const message = record(choice['message'])
  const rawUsage = record(body['usage'])
  // Eksik mesaj ya da kullanim sifir maliyetli basari sayilmaz: gecici hata, yedek calissin.
  const usageValid = isCount(rawUsage['prompt_tokens']) && isCount(rawUsage['completion_tokens'])
  if (Object.keys(message).length === 0 || !usageValid) {
    // Kullanim gecerliyse harcama gercek: hata bunu tasir, defter yazar.
    throw new LlmError(
      'Model yaniti gecersiz: mesaj ya da kullanim eksik',
      null,
      true,
      usageValid ? toUsage(rawUsage) : null,
    )
  }
  const toolCalls = Array.isArray(message['tool_calls']) ? message['tool_calls'] : []
  const toolArgs = toolCalls.length > 0 ? record(record(toolCalls[0])['function'])['arguments'] : undefined
  const finish = choice['finish_reason']
  return {
    text: typeof message['content'] === 'string' ? message['content'] : '',
    toolInput: toolCalls.length > 0 ? parseToolArguments(toolArgs) : null,
    // prompt_tokens onbellekliyi de sayar; maliyet icin ayri veriyoruz.
    usage: toUsage(rawUsage),
    stopReason: finish === 'length' ? 'max_tokens' : toolCalls.length > 0 ? 'tool' : 'end',
  }
}

export async function callOpenAiCompat(
  model: ResolvedModel,
  request: LlmRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderResult> {
  if (!model.baseUrl) throw new LlmError('openai_compat modelinde base_url yok', null, false)
  let response: Response
  try {
    response = await fetchImpl(`${model.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${model.apiKey}` },
      body: JSON.stringify(buildBody(model, request)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    // Ag ya da zaman asimi: gecici.
    throw new LlmError(err instanceof Error ? err.message : 'Model istegi basarisiz', null, true)
  }
  if (!response.ok) {
    const status = response.status
    throw new LlmError(`Model HTTP ${status}`, status, status === 429 || status >= 500)
  }
  try {
    return parse(await response.json())
  } catch (err) {
    if (err instanceof LlmError) throw err
    throw new LlmError(err instanceof Error ? err.message : 'Model yaniti okunamadi', response.status, true)
  }
}
