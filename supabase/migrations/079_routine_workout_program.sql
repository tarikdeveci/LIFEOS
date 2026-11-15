-- 079: Workout blok rutini bir antrenman programına bağlanır.
-- Program günü (A/B/C) bloğun günlerine sırayla düşer; hangi günün hangi bloğa geldiği
-- istemcide hesaplanır (shared utils/programSchedule.ts), sunucuda üretici değişmez.
-- Numara: 078 `events.ai_used` işi için ayrılı (KALAN_ADIMLAR Faz 6 güvenlik notu).

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS workout_program_id UUID REFERENCES workout_programs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_routines_workout_program
  ON routines(workout_program_id) WHERE workout_program_id IS NOT NULL;

-- Yalnız workout türündeki blok rutini programa bağlanır.
ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_program_kind;
ALTER TABLE routines
  ADD CONSTRAINT routines_program_kind
  CHECK (workout_program_id IS NULL OR (kind = 'block' AND block_type = 'workout'));

-- FK sahipliği doğrulamaz: bağlanan program kullanıcının kendisinin ya da global olmalı.
-- Tetikleyici çağıranın yetkisiyle çalışır; workout_programs SELECT RLS'i ("global or own")
-- başkasının programını görünmez kılar, bu yüzden EXISTS yalnız izinli programlarda doğrudur.
CREATE OR REPLACE FUNCTION check_routine_program_access() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.workout_program_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM workout_programs WHERE id = NEW.workout_program_id) THEN
    RAISE EXCEPTION 'workout program not accessible' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_routine_program_access ON routines;
CREATE TRIGGER trg_routine_program_access
  BEFORE INSERT OR UPDATE OF workout_program_id ON routines
  FOR EACH ROW EXECUTE FUNCTION check_routine_program_access();
