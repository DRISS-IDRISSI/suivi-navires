-- Rapports horaires RTG (REP_RTG_MOVES_HOURLY)
create table if not exists public.rtg_hourly (
  id text primary key,            -- AAAAMMJJHHMM de la fin de fenêtre (heure du Maroc)
  ts timestamptz not null,
  data jsonb not null
);
create index if not exists rtg_hourly_ts_idx on public.rtg_hourly (ts desc);
alter table public.rtg_hourly enable row level security;
drop policy if exists "lecture equipe" on public.rtg_hourly;
drop policy if exists "import equipe" on public.rtg_hourly;
drop policy if exists "maj equipe" on public.rtg_hourly;
create policy "lecture equipe" on public.rtg_hourly for select to authenticated using (true);
create policy "import equipe" on public.rtg_hourly for insert to authenticated with check (true);
create policy "maj equipe" on public.rtg_hourly for update to authenticated using (true) with check (true);
-- Relire les mails récents avec la nouvelle fonction (les rapports déjà reçus sont simplement réécrits)
delete from public.mail_processed where processed_at > now() - interval '3 days';
