-- 075_delete_routine_completed.sql
-- (#31) Tiklenmis (tamamlanmis) rutin silinince bugunku ornegi planda yetim (sahipsiz)
-- kaliyordu; delete_routine yeniden tanimlanip, rutin silinirken bugun ve sonrasina
-- ait tum orneklerinin (tamamlanmis/degistirilmis olanlar dahil) silinmesi saglandi.

CREATE OR REPLACE FUNCTION public.delete_routine(p_routine UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user UUID := auth.uid();
  v_today DATE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM routines WHERE id = p_routine AND user_id = v_user) THEN
    RAISE EXCEPTION 'routine not found' USING ERRCODE = 'P0002';
  END IF;

  v_today := (now() AT TIME ZONE public.user_timezone(v_user))::date;

  PERFORM set_config('lifeos.routine_regen', 'on', true);

  DELETE FROM time_blocks tb
  WHERE tb.routine_id = p_routine
    AND tb.occurrence_date >= v_today;

  DELETE FROM tasks t
  WHERE t.routine_id = p_routine
    AND t.occurrence_date >= v_today;

  PERFORM set_config('lifeos.routine_regen', 'off', true);

  DELETE FROM routines WHERE id = p_routine;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_routine(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_routine(UUID) TO authenticated;
