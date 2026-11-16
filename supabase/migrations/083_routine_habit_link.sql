-- 083: Alışkanlığı bloğa bağlama (spec 2026-11-15 §5).
-- Örnek: "Hareket" alışkanlığı ile spor bloğu aynı işi sayıyor; blok bitince alışkanlık
-- kendiliğinden işaretlenir, iş iki kez işaretlenmez.
--
-- Bir alışkanlığa birden çok blok rutini bağlanabilir. Bir blok bir günde en çok bir kez
-- sayar; hangi birimin bloktan geldiği routine_completions.source_block_ids'te tutulur.
-- Tamamlama geri alınınca yalnız o bloğun eklediği birim geri alınır, elle işaret kalır.

ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS habit_routine_id UUID REFERENCES public.routines(id) ON DELETE SET NULL;

ALTER TABLE public.routines DROP CONSTRAINT IF EXISTS routines_habit_link_block_only;
ALTER TABLE public.routines
  ADD CONSTRAINT routines_habit_link_block_only CHECK (habit_routine_id IS NULL OR kind = 'block');

CREATE INDEX IF NOT EXISTS idx_routines_habit_routine
  ON public.routines(habit_routine_id) WHERE habit_routine_id IS NOT NULL;

ALTER TABLE public.routine_completions
  ADD COLUMN IF NOT EXISTS source_block_ids UUID[] NOT NULL DEFAULT '{}';

-- Bağlanan rutin aynı kullanıcının alışkanlığı olmalı. RLS routines'i sahibine süzer ama
-- FK kontrolü RLS'i atlar: başkasının rutin id'si bilinirse bağlanabilirdi.
CREATE OR REPLACE FUNCTION public.check_routine_habit_link()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.habit_routine_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM routines h
    WHERE h.id = NEW.habit_routine_id AND h.kind = 'habit' AND h.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'habit_routine_id must reference own habit routine'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS routines_check_habit_link ON public.routines;
CREATE TRIGGER routines_check_habit_link
  BEFORE INSERT OR UPDATE OF habit_routine_id, user_id ON public.routines
  FOR EACH ROW EXECUTE FUNCTION public.check_routine_habit_link();

-- Blok tamamlanınca bağlı alışkanlığın o günkü sayacına bir birim; geri alınınca o birim çıkar.
-- Gün bloğun kendi tarihi (time_blocks.date), kullanıcının yerel günüdür.
CREATE OR REPLACE FUNCTION public.sync_block_habit_completion()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_habit routines%ROWTYPE;
  v_cap SMALLINT;
  v_row RECORD;
BEGIN
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
    SELECT h.* INTO v_habit
    FROM routines b
    JOIN routines h ON h.id = b.habit_routine_id
    WHERE b.id = NEW.routine_id AND h.kind = 'habit' AND h.user_id = NEW.user_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v_cap := COALESCE(v_habit.times_per_day, 1);

    INSERT INTO routine_completions (routine_id, user_id, completed_on, count, source_block_ids)
    VALUES (v_habit.id, NEW.user_id, NEW.date, 1, ARRAY[NEW.id])
    ON CONFLICT (routine_id, completed_on) DO UPDATE
      SET count = routine_completions.count + 1,
          source_block_ids = array_append(routine_completions.source_block_ids, NEW.id)
      WHERE NOT (NEW.id = ANY (routine_completions.source_block_ids))
        AND routine_completions.count < v_cap;
  ELSIF NEW.completed_at IS NULL AND OLD.completed_at IS NOT NULL THEN
    -- Bloğun rutini ya da bağı o arada değişmiş olabilir: birim, bloğun id'siyle bulunur.
    -- Satır önce kilitlenir: aynı anda iki geri alma sayacı sıfırın altına itemesin.
    FOR v_row IN
      SELECT routine_id, completed_on, count FROM routine_completions
      WHERE user_id = NEW.user_id AND NEW.id = ANY (source_block_ids)
      FOR UPDATE
    LOOP
      IF v_row.count <= 1 THEN
        DELETE FROM routine_completions
        WHERE routine_id = v_row.routine_id AND completed_on = v_row.completed_on;
      ELSE
        UPDATE routine_completions
        SET count = count - 1,
            source_block_ids = array_remove(source_block_ids, NEW.id)
        WHERE routine_id = v_row.routine_id AND completed_on = v_row.completed_on;
      END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS time_blocks_habit_completion ON public.time_blocks;
CREATE TRIGGER time_blocks_habit_completion
  AFTER UPDATE OF completed_at ON public.time_blocks
  FOR EACH ROW
  WHEN ((OLD.completed_at IS NULL) <> (NEW.completed_at IS NULL))
  EXECUTE FUNCTION public.sync_block_habit_completion();

-- Bloktan gelen birim sayısı sayacı aşamaz. Elle geri alma yalnız count yazar (istemci upsert'i);
-- fazla kalan en eski kaynak düşer, yoksa sonraki blok geri alması diğer bloğun birimini silerdi.
CREATE OR REPLACE FUNCTION public.trim_completion_sources()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_len INT := cardinality(NEW.source_block_ids);
BEGIN
  IF v_len > NEW.count THEN
    NEW.source_block_ids := NEW.source_block_ids[v_len - NEW.count + 1 : v_len];
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS routine_completions_trim_sources ON public.routine_completions;
CREATE TRIGGER routine_completions_trim_sources
  BEFORE INSERT OR UPDATE OF count, source_block_ids ON public.routine_completions
  FOR EACH ROW EXECUTE FUNCTION public.trim_completion_sources();

-- Tetikleyici fonksiyonları doğrudan çağrılmaz.
REVOKE EXECUTE ON FUNCTION public.check_routine_habit_link() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_block_habit_completion() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trim_completion_sources() FROM PUBLIC, anon, authenticated;
