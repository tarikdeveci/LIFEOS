-- 069: Rutin, alışkanlık işareti ve hedef değişiklikleri realtime ile öteki cihaza gider.
-- İstemci olay gelince ilgili listeyi yeniden okur; eski satır içeriğine ihtiyaç yok,
-- bu yüzden REPLICA IDENTITY varsayılan kalır (DELETE olayında birincil anahtar gelir).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['routines', 'routine_completions', 'goals'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;
