// supabase/functions/_shared/ai/llm/edge.ts
//
// Edge function tekili: service role istemcisiyle iki tabloyu okuyan router.
// Ayri dosya: router.ts saf kalsin, Node testleri https importunu yuklemesin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.2'

import { createRouter } from './router.ts'
import type { AiModelRow, AiRouteRow, AiRouter, CatalogRows } from './router.ts'

async function loadCatalog(): Promise<CatalogRows> {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const [models, routes] = await Promise.all([
    admin.from('ai_models').select('*'),
    admin.from('ai_model_routes').select('*'),
  ])
  if (models.error) throw new Error(models.error.message)
  if (routes.error) throw new Error(routes.error.message)
  return { models: (models.data ?? []) as AiModelRow[], routes: (routes.data ?? []) as AiRouteRow[] }
}

let singleton: AiRouter | null = null

export function getRouter(): AiRouter {
  singleton ??= createRouter({ load: loadCatalog, env: (name) => Deno.env.get(name) })
  return singleton
}
