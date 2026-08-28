// Güven skoru — aşama aşama ayrıştırılmış, tek bir "AI ne kadar emin" hissi değil.
//
// Ayrıştırmanın amacı düşük skorun EYLEME DÖNÜŞEBİLİR olması: skor kimlikten mi
// yoksa miktardan mı düştü sorusunun cevabı, kullanıcıya hangi soruyu soracağımızı
// belirler. Tek skalar bunu söyleyemez.

import type { Disposition, Portion, Resolution } from './types.ts'

/** Bu eşiğin üstü kullanıcıya sorulmadan loglanabilir. */
export const AUTO_THRESHOLD = 0.75

export function scoreConfidence(
  extractConfidence: number,
  resolution: Resolution,
  portion: Portion,
): number {
  if (!resolution.ref || !portion.grams) return 0

  // Tolerans ne kadar genişse miktar bilgisi o kadar zayıf. Tamamen sıfırlamıyoruz:
  // ±%40'lık bir tahmin bile doğru yiyecek üstünde işe yarar bir kayıttır.
  const portionScore = Math.max(0.55, 1 - portion.tolerance / 2)
  const extractScore = 0.9 + 0.1 * Math.min(Math.max(extractConfidence, 0), 1)

  const score = resolution.confidence * portionScore * extractScore
  return Math.min(1, Math.max(0, score))
}

export function dispositionOf(confidence: number): Disposition {
  return confidence >= AUTO_THRESHOLD ? 'auto' : 'confirm'
}
