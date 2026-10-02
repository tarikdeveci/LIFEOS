// supabase/functions/ai-suggest/model.ts
// Model seçimi ve model yanıtından metin okuma.

// Sohbet modeli. parse-meal'deki NUTRITION_MODEL ile ayni desen: koda dokunmadan
// `supabase secrets set CHAT_MODEL=...` ile degistirilebilir.
//
// Neden opus-4-6 degil: prompt onbellegi ONEK eslesmesidir ve onbellege girmek
// icin onegin model bazli bir asgari uzunlugu asmasi gerekir. Opus 4.6'da bu
// esik 4096 token; uc promptumuzun sabit onegi de (762 / 3712 / 657 token) bu
// esigin ALTINDA kaliyor, yani o modelde cache_control eklemek sessizce hicbir
// sey yapmaz. Opus 5'te esik 512 token ve girdi/cikti fiyati ayni ($5/$25):
// ayni para, daha yeni model, uc rotada da calisan onbellek.
//
// effort 'low': bu rotalar 3-5 cumlelik JSON uretiyor. Opus 5'te dusunme
// varsayilan olarak ACIK ve dusunme token'lari CIKTI olarak faturalaniyor;
// sohbet rotalarinda derin dusunme ne kaliteyi olcülebilir sekilde artiriyor
// ne de max_tokens butcesini paylasmasi guvenli.
export const CHAT_MODEL = Deno.env.get('CHAT_MODEL') ?? 'claude-opus-5'
export const CHAT_EFFORT = { effort: 'low' } as const

// Aylik AI butcesini asan kullanicinin sohbetleri bu modelden devam eder
// (_shared/ai/usage.ts). Sonnet 5 effort 'low' destekliyor, fiyati Opus 5'in
// %40'i ($2/$10).
export const BUDGET_CHAT_MODEL = Deno.env.get('BUDGET_CHAT_MODEL') ?? 'claude-sonnet-5'

// daily_plan ve task_priority rotalari. Sonnet 4 ($3/$15) yerine Sonnet 5
// ($2/$10): ayni is, daha ucuz ve daha yeni model.
export const LEGACY_MODEL = Deno.env.get('LEGACY_SUGGEST_MODEL') ?? 'claude-sonnet-5'

/** Modelden gelen ilk text bloğunun metni; yoksa boş string. */
export function firstText(response: { content: Array<{ type: string; text?: string }> }): string {
  const block = response.content.find((b) => b.type === 'text')
  return block?.type === 'text' && typeof block.text === 'string' ? block.text : ''
}
