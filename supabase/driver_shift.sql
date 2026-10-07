-- Mouvements par conducteur (RTG et SC) du dernier shift : un enregistrement par shift
create table if not exists public.driver_shift (
  id text primary key,            -- AAAAMMJJ + code du shift, ex. 20261005S3
  ts timestamptz not null,        -- fin du shift
  data jsonb not null
);
create index if not exists driver_shift_ts_idx on public.driver_shift (ts desc);
alter table public.driver_shift enable row level security;
drop policy if exists "lecture equipe" on public.driver_shift;
drop policy if exists "import equipe" on public.driver_shift;
drop policy if exists "maj equipe" on public.driver_shift;
create policy "lecture equipe" on public.driver_shift for select to authenticated using (true);
create policy "import equipe" on public.driver_shift for insert to authenticated with check (true);
create policy "maj equipe" on public.driver_shift for update to authenticated using (true) with check (true);
-- Relire les mails des 3 derniers jours avec la nouvelle fonction (rien n'est perdu : les rapports sont réécrits)
delete from public.mail_processed where processed_at > now() - interval '3 days';
