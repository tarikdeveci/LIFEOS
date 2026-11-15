// Misafirden mevcut hesaba girişte kaybolacak veriyi sayar ve uyarı türünü seçer.
// Saf mantık: sayım sorguları dışarıdan verilir, null sonuç "sayılamadı" demektir.

export type SwitchWarning =
  | { kind: 'none' }
  | { kind: 'counted'; tasks: number; meals: number; blocks: number; workouts: number }
  | { kind: 'uncounted' }

export interface GuestCounts {
  tasks: number | null
  meals: number | null
  blocks: number | null
  workouts: number | null
}

export function decideSwitchWarning(counts: GuestCounts): SwitchWarning {
  const values = [counts.tasks, counts.meals, counts.blocks, counts.workouts]
  const known = values.filter((v): v is number => v !== null)
  const total = known.reduce((a, b) => a + b, 0)
  if (total > 0) {
    return { kind: 'counted', tasks: counts.tasks ?? 0, meals: counts.meals ?? 0, blocks: counts.blocks ?? 0, workouts: counts.workouts ?? 0 }
  }
  return known.length < values.length ? { kind: 'uncounted' } : { kind: 'none' }
}

/** Her sayım ayrı ayrı zaman aşımına ve hataya karşı korunur; başarısızlık null olur. */
export async function collectGuestCounts(
  counters: { [K in keyof GuestCounts]: () => Promise<number> },
  timeoutMs: number,
): Promise<GuestCounts> {
  const guard = (run: () => Promise<number>): Promise<number | null> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs)
      run().then(
        (n) => { clearTimeout(timer); resolve(Number.isFinite(n) ? n : null) },
        () => { clearTimeout(timer); resolve(null) },
      )
    })
  const [tasks, meals, blocks, workouts] = await Promise.all([
    guard(counters.tasks), guard(counters.meals), guard(counters.blocks), guard(counters.workouts),
  ])
  return { tasks, meals, blocks, workouts }
}


/** Sıfır olmayan parçaları sırayla dizer: "A ve B", "A, B ve C". */
export function joinCountedParts(warning: Extract<SwitchWarning, { kind: 'counted' }>, parts: (key: 'tasks' | 'meals' | 'blocks' | 'workouts', n: number) => string, and: string): string {
  const items = (['tasks', 'meals', 'blocks', 'workouts'] as const)
    .filter((k) => warning[k] > 0)
    .map((k) => parts(k, warning[k]))
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`
}
