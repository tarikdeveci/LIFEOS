import { todayDate } from '@lifeos/shared'
import type { ParseMealResponse } from '@lifeos/shared'

import { loadStoredLang, getCurrentT } from '../contexts/LangContext'
import { supabase } from './supabase'
import { runPostSignupAfterAiResult } from '../auth/postSignup'

const BASE = process.env['EXPO_PUBLIC_SUPABASE_URL']!
const ANON = process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY']!

async function getToken(): Promise<string> {
  let { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    const { data } = await supabase.auth.refreshSession()
    session = data.session
  }
  if (!session) throw new Error(getCurrentT().misc_session_not_found)
  return session.access_token
}

/**
 * Sunucunun AI kapısı reddetti: Pro gerekli (402; free kullanıcının ücretsiz
 * planlama hakkı bittiğinde de bu), hesap gerekli (403, misafir ya da onaysız
 * e-posta) ya da bu ayki AI sınırı doldu (429).
 * Kapı kuralları: supabase/functions/_shared/ai/usage.ts
 */
export type AiAccessCode = 'pro_required' | 'ai_budget_exhausted' | 'account_required'

export class AiAccessError extends Error {
  readonly code: AiAccessCode

  constructor(code: AiAccessCode, message: string) {
    super(message)
    this.name = 'AiAccessError'
    this.code = code
  }
}

export const AI_BUDGET_MESSAGE = () => getCurrentT().misc_ai_budget_exhausted

/** Sohbet ekranlarının hata balonu: sınır dolduysa bunu söyle, yoksa ekranın kendi metni. */
export function aiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof AiAccessError && error.code === 'ai_budget_exhausted' ? AI_BUDGET_MESSAGE() : fallback
}

export async function callAiSuggest<T>(body: Record<string, unknown>): Promise<T> {
  const token = await getToken()
  // Arayüz dili: sunucu koçun cevap dilini buna göre seçer, gönderilmezse Türkçe cevaplar.
  const language = await loadStoredLang()
  const res = await fetch(`${BASE}/functions/v1/ai-suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
    // Yerel bugün tarihi daima gönderilir: sunucu UTC'de çalışıyor ve
    // toISOString() UTC+3'te gece yarısından sonra bir önceki günü veriyor.
    body: JSON.stringify({ today: todayDate(), language, ...body }),
  })
  if (!res.ok) {
    if (res.status === 403) {
      const payload = (await res.json().catch(() => null)) as { code?: string } | null
      if (payload?.code === 'account_required') throw new AiAccessError('account_required', 'AI erisimi icin hesap gerekli')
      throw new AiAccessError('pro_required', 'AI erisimi icin Pro abonelik gerekli')
    }
    if (res.status === 402) throw new AiAccessError('pro_required', 'AI erisimi icin Pro abonelik gerekli')
    if (res.status === 429) {
      const payload = (await res.json().catch(() => null)) as { code?: string } | null
      if (payload?.code === 'ai_budget_exhausted') throw new AiAccessError('ai_budget_exhausted', AI_BUDGET_MESSAGE())
    }
    throw new Error(`AI suggest error: ${res.status}`)
  }
  // Hesap yeni açıldıysa bekleyen post_signup paywall'ı ilk AI sonucundan sonra açılır.
  void runPostSignupAfterAiResult()
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
    throw new Error(`Parse meal error: ${res.status}`)
  }
  const data: unknown = await res.json()
  if (!isParseMealResponse(data)) throw new Error('Parse meal response is not in the expected format')
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
