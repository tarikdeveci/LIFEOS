import { syncWidgetData } from '../utils/widgetSync'

function isToday(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false
  const today = new Date()
  const tzOffset = today.getTimezoneOffset() * 60000
  const localToday = new Date(today.getTime() - tzOffset).toISOString().slice(0, 10)
  return dateStr.startsWith(localToday)
}

type AnyState = Record<string, unknown>

// Zustand middleware — store'daki her state değişiminde widget datasını derler ve yazar.
// Kullanım: create(withWidgetSync((...) => ({ ... })))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withWidgetSync(config: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (set: (s: any, replace?: boolean) => void, get: () => AnyState, api: unknown) =>
    config(
      (s: AnyState, replace?: boolean) => {
        set(s, replace)
        const state = get()

        const tasks = Array.isArray(state['tasks'])
          ? (state['tasks'] as Array<Record<string, unknown>>)
          : []

        const todayTasks = tasks
          .filter((t) => !t['done'] && isToday(t['scheduled_date'] as string | null))
          .sort(
            (a, b) =>
              ((b['priority_score'] as number) ?? 0) -
              ((a['priority_score'] as number) ?? 0),
          )
          .slice(0, 5)
          .map((t) => ({
            id: String(t['id'] ?? ''),
            title: String(t['title'] ?? ''),
            priority: Number(t['priority_score'] ?? 0),
            done: Boolean(t['done']),
          }))

        const todayTotal =
          typeof state['todayTotal'] === 'number' ? state['todayTotal'] : null
        const dailyTarget =
          typeof state['dailyTarget'] === 'number' ? state['dailyTarget'] : null

        void syncWidgetData({
          updatedAt: new Date().toISOString(),
          todayTasks,
          nextEvent: null,
          calorieProgress:
            todayTotal !== null && dailyTarget !== null
              ? { consumed: todayTotal, target: dailyTarget }
              : null,
        })
      },
      get,
      api,
    )
}
