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
// Dikkat: ömür boyu 3 hakkı sayan SQL (ai_allowance, 052/053) yalnızca
// props->>'kind' = 'replan' satırlarını sayıyor. life_setup'ın hak düşürmesi için
// o fonksiyonun FILTER koşulu bu kümeyle birlikte güncellenmeli.

export const FREE_KINDS: ReadonlySet<string> = new Set(['replan', 'life_setup'])
