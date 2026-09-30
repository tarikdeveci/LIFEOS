import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateFocusSessionInput, FocusSession } from '../types/focus'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supabase = SupabaseClient<any>

export async function createFocusSession(
  supabase: Supabase, userId: string, input: CreateFocusSessionInput,
): Promise<FocusSession> {
  const { data, error } = await supabase.from('focus_sessions')
    .insert({ ...input, user_id: userId }).select().single()
  // A response may be lost after a successful insert. Retry the same id safely.
  if (error?.code === '23505' && input.id) {
    const existing = await supabase.from('focus_sessions').select('*')
      .eq('id', input.id).eq('user_id', userId).single()
    if (existing.error) throw existing.error
    return existing.data as unknown as FocusSession
  }
  if (error) throw error
  return data as unknown as FocusSession
}

/** Sessions starting in [fromIso, toIso); callers supply local day boundaries as instants. */
export async function getFocusSessionsBetween(
  supabase: Supabase, userId: string, fromIso: string, toIso: string,
): Promise<FocusSession[]> {
  const { data, error } = await supabase.from('focus_sessions').select('*')
    .eq('user_id', userId).gte('started_at', fromIso).lt('started_at', toIso)
    .order('started_at')
  if (error) throw error
  return data as unknown as FocusSession[]
}
