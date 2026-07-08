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

export async function callAiSuggest<T>(body: Record<string, unknown>): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${BASE}/functions/v1/ai-suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    if (res.status === 402 || res.status === 403) throw new Error('AI erisimi icin Pro abonelik gerekli')
    throw new Error(`AI suggest hatası: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function callParseMeal(body: Record<string, unknown>): Promise<ParseMealResult> {
  const token = await getToken()
  const res = await fetch(`${BASE}/functions/v1/parse-meal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    if (res.status === 402 || res.status === 403) throw new Error('AI erisimi icin Pro abonelik gerekli')
    throw new Error(`Parse meal hatası: ${res.status}`)
  }
  return res.json() as Promise<ParseMealResult>
}

export interface ParseMealResult {
  items: ParsedItem[]
  total_calories: number
  total_protein: number
  total_carbs: number
  total_fat: number
  total_fiber: number
}

export interface ParsedItem {
  name: string
  amount: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}
