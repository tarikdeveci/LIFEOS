/** Kaydırmanın gideceği ana sekme. Ana sekme dışında ve sıranın iki ucunda null döner. */
export function adjacentTab(pathname: string, step: 1 | -1, segments: readonly string[]): string | null {
  const index = segments.indexOf(pathname.slice(1))
  if (index === -1) return null
  return segments[index + step] ?? null
}

const EDGE_WIDTH = 48

/** Dokunuş ekran kenarında başladıysa o kenarın sekme yönü: sağ kenar sıradaki, sol kenar önceki. */
export function edgeStep(x: number, screenWidth: number): 1 | -1 | null {
  if (x <= EDGE_WIDTH) return -1
  if (x >= screenWidth - EDGE_WIDTH) return 1
  return null
}
