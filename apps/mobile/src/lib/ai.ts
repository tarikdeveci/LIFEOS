import { todayDate } from '@lifeos/shared'
import type { ParseMealResponse } from '@lifeos/shared'

import { supabase } from './supabase'

const BASE = process.env['EXPO_PUBLIC_SUPABASE_URL']!
const ANON = process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY']!

async function getToken(): Promise<string> {
  let { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    const { data } = await supabase.auth.refreshSession()
    session = data.session
  }
  if (!session) throw new Error('Oturum bulunamadı')
  return session.access_token
}

/**
 * Sunucunun AI kapısı reddetti: Pro gerekli (402; free kullanıcının ücretsiz
 * planlama hakkı bittiğinde de bu) ya da bu ayki AI sınırı doldu (429).
 * Kapı kuralları: supabase/functions/_shared/ai/usage.ts
 */
export class AiAccessError extends Error {
  readonly code: 'pro_required' | 'ai_budget_exhausted'

  constructor(code: 'pro_required' | 'ai_budget_exhausted', message: string) {
    super(message)
    this.name = 'AiAccessError'
    this.code = code
  }
}

export const AI_BUDGET_MESSAGE = "Bu ayki AI kullanım sınırına ulaştın. Ayın 1'inde yenilenir."

/** Sohbet ekranlarının hata balonu: sınır dolduysa bunu söyle, yoksa ekranın kendi metni. */
export function aiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof AiAccessError && error.code === 'ai_budget_exhausted' ? AI_BUDGET_MESSAGE : fallback
}

export async function callAiSuggest<T>(body: Record<string, unknown>): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${BASE}/functions/v1/ai-suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
    // Yerel bugün tarihi daima gönderilir: sunucu UTC'de çalışıyor ve
    // toISOString() UTC+3'te gece yarısından sonra bir önceki günü veriyor.
    body: JSON.stringify({ today: todayDate(), ...body }),
  })
  if (!res.ok) {
    if (res.status === 402 || res.status === 403) {
      throw new AiAccessError('pro_required', 'AI erisimi icin Pro abonelik gerekli')
    }
    if (res.status === 429) {
      const payload = (await res.json().catch(() => null)) as { code?: string } | null
      if (payload?.code === 'ai_budget_exhausted') throw new AiAccessError('ai_budget_exhausted', AI_BUDGET_MESSAGE)
    }
    throw new Error(`AI suggest hatası: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function callParseMeal(body: Record<string, unknown>): Promise<ParseMealResponse> {
  const token = await getToken()
  const res = await fetch(`${BASE}/functions/v1/parse-meal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`Parse meal hatası: ${res.status}`)
  }
  const data: unknown = await res.json()
  if (!isParseMealResponse(data)) throw new Error('Parse meal yanıtı beklenen biçimde değil')
  return data
}

function isParseMealResponse(value: unknown): value is ParseMealResponse {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return Array.isArray(candidate['items'])
    && Array.isArray(candidate['questions'])
    && typeof candidate['version'] === 'string'
    && Array.isArray(candidate['trace'])
    && !!candidate['ai']
    && typeof candidate['ai'] === 'object'
}
