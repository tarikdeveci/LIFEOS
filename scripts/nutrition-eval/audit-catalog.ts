// Kurate besin kataloğunun FİZİKSEL tutarlılık denetimi.
//
//   pnpm audit:foods
//
// eval:nutrition'dan farklı bir soruyu ölçer. Eval "ifade doğru satıra oturdu mu"
// diye sorar ve beklenen kaloriyi o satırdan TÜRETİR — yani satırın kendisi
// yanlışsa eval yeşil kalır. Bu betik satırın kendisine bakar.
//
// 039'un düzelttiği hata tam olarak bu boşluktan geçmişti: calories ve makrolar
// 100 g başına, serving_size ise gerçek porsiyon. Satır kendi içinde tutarlı
// (Atwater tutuyor), eval yeşil, ama "1 yemek kaşığı tereyağı" 717 kcal.

import { readFileSync } from 'node:fs'

interface Food {
  id: string
  name: string
  serving_size: number
  serving_unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
}

/** Saf yağın enerji yoğunluğu. Hiçbir yiyecek bunu aşamaz. */
const MAX_KCAL_PER_100G = 900

function loadEnvFile(path: string): Record<string, string> {
  try {
    const out: Record<string, string> = {}
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line)
      if (match) out[match[1]!] = match[2]!.replace(/^["']|["']$/g, '').trim()
    }
    return out
  } catch {
    return {}
  }
}

const per100 = (food: Food): number =>
  food.serving_size > 0 ? (food.calories / food.serving_size) * 100 : Number.NaN

async function main(): Promise<void> {
  const env = { ...loadEnvFile('.env.production'), ...loadEnvFile('.env'), ...process.env }
  const url = env['SUPABASE_URL'] ?? env['NEXT_PUBLIC_SUPABASE_URL']
  const key = env['SUPABASE_SERVICE_ROLE_KEY'] ?? env['SUPABASE_ANON_KEY']
  if (!url || !key) {
    console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY gerekli.')
    process.exit(1)
  }

  const columns = 'id,name,serving_size,serving_unit,calories,protein,carbs,fat'
  const response = await fetch(`${url}/rest/v1/food_items?select=${columns}&user_id=is.null`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!response.ok) {
    console.error(`food_items okunamadı: ${response.status} ${await response.text()}`)
    process.exit(1)
  }
  const foods = (await response.json()) as Food[]

  // HATA: fiziksel üst sınırın aşılması. Yanlış pozitifi yok.
  const impossible = foods
    .filter((food) => per100(food) > MAX_KCAL_PER_100G)
    .sort((a, b) => per100(b) - per100(a))

  // UYARI: makro toplamı porsiyonu aşıyor. Küçük aşımlar yuvarlamadan gelebilir
  // (bir Ferrero 12.5 g'dır, satırda 12 yazar) — bu yüzden hata değil, uyarı.
  const overweight = foods
    .filter((food) => food.serving_unit === 'g' && food.serving_size > 0)
    .map((food) => ({ food, ratio: (food.protein + food.carbs + food.fat) / food.serving_size }))
    .filter((entry) => entry.ratio > 1)
    .sort((a, b) => b.ratio - a.ratio)

  console.log(`kurate satır: ${foods.length}\n`)

  if (impossible.length > 0) {
    console.log(`HATA — ${MAX_KCAL_PER_100G} kcal/100g fiziksel sınırı aşan ${impossible.length} satır:`)
    for (const food of impossible) {
      console.log(`  ${per100(food).toFixed(0).padStart(5)} kcal/100g  ${food.name} (${food.serving_size}${food.serving_unit} = ${food.calories} kcal)`)
    }
    console.log()
  }

  if (overweight.length > 0) {
    console.log(`UYARI — makro toplamı porsiyonu aşan ${overweight.length} satır:`)
    for (const { food, ratio } of overweight) {
      console.log(`  x${ratio.toFixed(2)}  ${food.name}: P${food.protein}+C${food.carbs}+F${food.fat} = ${(food.protein + food.carbs + food.fat).toFixed(1)}g > ${food.serving_size}g porsiyon`)
    }
    console.log()
  }

  if (impossible.length === 0 && overweight.length === 0) {
    console.log('Temiz: fiziksel sınır aşımı yok, makro/porsiyon çelişkisi yok.')
  }
  process.exit(impossible.length > 0 ? 1 : 0)
}

await main()
