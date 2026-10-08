-- 069: Rutin, alışkanlık işareti ve hedef değişiklikleri realtime ile öteki cihaza gider.
-- İstemci olay gelince ilgili listeyi yeniden okur.
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

-- İstemci user_id filtresiyle abone olur. Supabase filtreli DELETE olayını ancak
-- REPLICA IDENTITY FULL ile iletir; yoksa silinen görev, blok, öğün veya sıfıra inen
-- alışkanlık işareti öteki cihaza hiç ulaşmaz. RLS açık olduğu için olaydaki eski
-- satır yine yalnızca id taşır, istemci de yalnızca id kullanır.
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.time_blocks REPLICA IDENTITY FULL;
ALTER TABLE public.meals REPLICA IDENTITY FULL;
ALTER TABLE public.routines REPLICA IDENTITY FULL;
ALTER TABLE public.routine_completions REPLICA IDENTITY FULL;
ALTER TABLE public.goals REPLICA IDENTITY FULL;
