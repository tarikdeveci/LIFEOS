const EDGE_WIDTH = 48

/** Dokunuş ekran kenarında başladıysa o kenarın sekme yönü: sağ kenar sıradaki, sol kenar önceki. */
export function edgeStep(x: number, screenWidth: number): 1 | -1 | null {
  if (x <= EDGE_WIDTH) return -1
  if (x >= screenWidth - EDGE_WIDTH) return 1
  return null
}
