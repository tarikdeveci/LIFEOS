// supabase/functions/_shared/ai/freeKinds.ts
//
// Ücretsiz kullanıcıya açık AI rotaları: erişim kararının TEK noktası.
// resolveAiAccess (usage.ts) yalnızca buraya bakar; yeni bir rotayı ücretsiz
// haklara katmak ya da çıkarmak için bu kümeyi değiştirmek yeter.
//
//   replan      : ürünün vaadi olan gün planı.
//   life_setup  : hayat planı kurulumu. Kullanıcı kararıyla (2026-10-05) ömür boyu
//                 3 ücretsiz hakkın içinde; Pro'ya özel değil.
//
// Bilerek DIŞARIDA: daily_report (gün raporu AI yorumu yalnızca Pro) ve sohbet
// rotaları. Sohbet ve antrenman koçu "bir kez görüp anlama" özelliği değil.
//
// Dikkat: aynı küme SQL'de de yazılı: ai_allowance() sayacı ve reserve_ai_use()
// rezervasyonu (065). Küme değişirse yeni bir migration ile ikisi de güncellenmeli;
// tests/functions/aiAccess.test.ts farkı yakalar.

export const FREE_KINDS: ReadonlySet<string> = new Set(['replan', 'life_setup'])
