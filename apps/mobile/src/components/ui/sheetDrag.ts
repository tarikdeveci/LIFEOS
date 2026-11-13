const CLOSE_DISTANCE = 100
const CLOSE_VELOCITY = 800

/** Sheet yalnız aşağı iner; yukarı çekmek onu yerinden oynatmaz. */
export function sheetDragOffset(translationY: number): number {
  'worklet'
  return Math.max(translationY, 0)
}

/** Parmak kalkınca sheet kapansın mı: yeterli mesafe veya aşağı doğru hızlı fiske. */
export function shouldCloseSheet(translationY: number, velocityY: number): boolean {
  'worklet'
  if (translationY <= 0) return false
  return translationY > CLOSE_DISTANCE || velocityY > CLOSE_VELOCITY
}
