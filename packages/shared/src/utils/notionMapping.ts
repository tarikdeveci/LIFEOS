/**
 * Notion veri kaynağı şemasından görev eşlemesi. Kullanıcı sadece veritabanını seçer;
 * başlık zorunlu, kişi, durum (status > checkbox) ve tarih ilk uygun özellik.
 * Aynı şekil supabase/functions/_shared/integrations/mappers.ts NotionMapping'de okunur.
 */

export interface NotionMapping {
  title: string
  people?: string
  status?: { name: string; type: 'status' | 'checkbox' | 'select' }
  date?: string
}

export function detectNotionMapping(properties: Record<string, { type: string }>): NotionMapping | null {
  const entries = Object.entries(properties)
  const find = (type: string) => entries.find(([, p]) => p.type === type)?.[0]
  const title = find('title')
  if (!title) return null
  const statusName = find('status')
  const checkbox = find('checkbox')
  const people = find('people')
  const date = find('date')
  return {
    title,
    ...(people ? { people } : {}),
    ...(statusName ? { status: { name: statusName, type: 'status' as const } }
      : checkbox ? { status: { name: checkbox, type: 'checkbox' as const } } : {}),
    ...(date ? { date } : {}),
  }
}
