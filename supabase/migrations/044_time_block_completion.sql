-- Zaman bloklarının tamamlanma durumu.
--
-- Blokta "bitti" diye bir kavram yoktu: web tarafında işaret yalnızca React
-- state'inde duruyordu (`PlanningView` içindeki completedBlockIds), sayfa
-- yenilendiğinde kayboluyordu; mobilde hiç yoktu. Blok bitip bitmediği geçmiş
-- saatten çıkarsanıyordu — yani "yaptım" ile "saati geçti" ayırt edilemiyordu.
--
-- Zaman damgası tutuluyor, boolean değil: seriler ve günlük özet ne zaman
-- işaretlendiğini bilmek zorunda, sonradan bir de sütun eklemek gerekmesin.
ALTER TABLE time_blocks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN time_blocks.completed_at IS
  'Kullanıcı bloğu tamamlandı işaretlediği an. NULL = tamamlanmadı.';

-- Günlük özet "bugün kaç blok bitti" sorusunu sorar; tamamlanmamış bloklar
-- indeksin dışında kalsın diye kısmi indeks.
CREATE INDEX IF NOT EXISTS time_blocks_completed_idx
  ON time_blocks(user_id, date)
  WHERE completed_at IS NOT NULL;
