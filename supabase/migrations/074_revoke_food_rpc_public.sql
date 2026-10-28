-- Beslenme RPC'leri yalniz service_role icin. 032, 042 ve 043 bunlara
-- service_role'e GRANT verdi ama PUBLIC'ten REVOKE etmedi; Postgres yeni
-- fonksiyona EXECUTE'u PUBLIC'e varsayilan verir. SECURITY DEFINER olduklari
-- icin uygulamada gomulu anon anahtariyla RLS atlanabiliyordu: baskasinin
-- hesabina yiyecek yazma (save_estimated_food, record_food_gap), herkesin
-- yiyeceklerinin embedding'ini bozma (set_food_*_embeddings), baska bir
-- kullanicinin ozel yiyeceklerini okuma (search_food_semantic, p_user serbest).
-- Tek cagiran parse-meal (service role istemcisi, _shared/nutrition/repo.ts).

REVOKE EXECUTE ON FUNCTION save_estimated_food(
  UUID, TEXT, TEXT, TEXT[], NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, TEXT, BOOLEAN, TEXT, TEXT, NUMERIC
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION record_food_gap(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION set_food_corpus_embeddings(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION set_food_item_embeddings(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION search_food_semantic(extensions.vector, UUID, INTEGER, REAL)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION save_estimated_food(
  UUID, TEXT, TEXT, TEXT[], NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC,
  NUMERIC, TEXT, BOOLEAN, TEXT, TEXT, NUMERIC
) TO service_role;
GRANT EXECUTE ON FUNCTION record_food_gap(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION set_food_corpus_embeddings(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION set_food_item_embeddings(JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION search_food_semantic(extensions.vector, UUID, INTEGER, REAL) TO service_role;
