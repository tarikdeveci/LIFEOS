-- Günlük digest bildirimlerinin idempotent olmasını sağlar.
--
-- daily-digest saat başı çalışıp "kullanıcının yerel saati == digest_hour mı"
-- diye bakıyordu; gönderdiğini hiçbir yere yazmıyordu. Cron'un aynı saat içinde
-- iki kez tetiklenmesi (yeniden deneme, elle test, ikinci bir zamanlayıcı)
-- doğrudan çift bildirim demekti. Blok hatırlatmaları zaten
-- time_blocks.notification_sent_at ile korunuyordu; digest'in karşılığı buydu.
create table if not exists public.notification_log (
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,   -- 'daily_digest_morning' | '..._midday' | '..._evening'
  local_date date not null,   -- kullanıcının KENDİ saat dilimindeki gün
  sent_at    timestamptz not null default now(),
  primary key (user_id, kind, local_date)
);

alter table public.notification_log enable row level security;

-- Yalnızca service_role yazar (edge function). Kullanıcı kendi kaydını görebilir.
create policy "own notification log" on public.notification_log
  for select using (auth.uid() = user_id);

-- Eski kayıtlar birikmesin
create index if not exists notification_log_sent_at_idx
  on public.notification_log (sent_at);
