-- Eski program oluşturucularında bir hareketin set sayısı, aynı hareketi
-- art arda birden fazla program_exercises satırı olarak yazarak tutulabiliyordu.
-- Yeni modelde her hareket tek satırdır ve set sayısı `sets` kolonundadır.
--
-- Yanlış birleştirmeyi önlemek için yalnızca aşağıdaki kesin eski-model şekli
-- dönüştürülür:
--   * aynı program günü ve aynı exercise_id,
--   * ardışık order_index,
--   * aynı reps/rest_seconds/notes,
--   * dizideki bütün satırlarda sets = 1.
-- Farklı tekrar, dinlenme veya not taşıyan drop-set/superset benzeri kayıtlar
-- ve gün içinde ayrı konumlarda tekrarlanan hareketler aynen korunur.

CREATE TEMP TABLE legacy_program_exercise_runs
AS
WITH ordered AS (
  SELECT
    pe.*,
    lag(pe.exercise_id) OVER day_order AS previous_exercise_id,
    lag(pe.reps) OVER day_order AS previous_reps,
    lag(pe.rest_seconds) OVER day_order AS previous_rest_seconds,
    lag(pe.notes) OVER day_order AS previous_notes,
    lag(pe.order_index) OVER day_order AS previous_order_index
  FROM program_exercises pe
  WINDOW day_order AS (
    PARTITION BY pe.program_day_id
    ORDER BY pe.order_index, pe.id
  )
), segmented AS (
  SELECT
    ordered.*,
    sum(
      CASE
        WHEN exercise_id = previous_exercise_id
          AND reps IS NOT DISTINCT FROM previous_reps
          AND rest_seconds IS NOT DISTINCT FROM previous_rest_seconds
          AND notes IS NOT DISTINCT FROM previous_notes
          AND order_index = previous_order_index + 1
        THEN 0
        ELSE 1
      END
    ) OVER (
      PARTITION BY program_day_id
      ORDER BY order_index, id
    ) AS run_number
  FROM ordered
), eligible AS (
  SELECT
    program_day_id,
    run_number,
    min(order_index) AS first_order_index,
    count(*)::int AS set_count
  FROM segmented
  GROUP BY program_day_id, run_number
  HAVING count(*) > 1 AND bool_and(sets = 1)
)
SELECT
  segmented.id,
  first_value(segmented.id) OVER (
    PARTITION BY segmented.program_day_id, segmented.run_number
    ORDER BY segmented.order_index, segmented.id
  ) AS keeper_id,
  eligible.set_count
FROM segmented
JOIN eligible
  ON eligible.program_day_id = segmented.program_day_id
  AND eligible.run_number = segmented.run_number;

UPDATE program_exercises pe
SET sets = runs.set_count
FROM legacy_program_exercise_runs runs
WHERE pe.id = runs.keeper_id
  AND runs.id = runs.keeper_id
  AND pe.sets = 1;

DELETE FROM program_exercises pe
USING legacy_program_exercise_runs runs
WHERE pe.id = runs.id
  AND runs.id <> runs.keeper_id;

DROP TABLE legacy_program_exercise_runs;
