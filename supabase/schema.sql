-- Suivi des escales TC3 : à exécuter une fois dans Supabase > SQL Editor

create table if not exists public.snapshots (
  id         text primary key,            -- AAAAMMJJHHMM du rapport (ex. 202610041503)
  ts         timestamptz not null,        -- date/heure du rapport
  shift      text,
  data       jsonb not null,              -- navires, mouvements, grues
  created_at timestamptz not null default now()
);
create index if not exists snapshots_ts_idx on public.snapshots (ts);

alter table public.snapshots enable row level security;

-- Seuls les utilisateurs connectés (comptes créés par vous) peuvent lire et importer
drop policy if exists "lecture equipe" on public.snapshots;
create policy "lecture equipe" on public.snapshots for select to authenticated using (true);
drop policy if exists "import equipe" on public.snapshots;
create policy "import equipe" on public.snapshots for insert to authenticated with check (true);
drop policy if exists "maj equipe" on public.snapshots;
create policy "maj equipe" on public.snapshots for update to authenticated using (true) with check (true);
-- Pas de suppression depuis l'application. La fonction d'import utilise la clé service_role (hors RLS).

-- Rapports horaires (REP_QUAY_CRANE_DELAYS) : voir aussi SUPABASE_table_hourly.sql
create table if not exists public.hourly (
  id         text primary key,
  ts         timestamptz not null,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists hourly_ts_idx on public.hourly (ts);
alter table public.hourly enable row level security;
drop policy if exists "lecture equipe" on public.hourly;
create policy "lecture equipe" on public.hourly for select to authenticated using (true);
drop policy if exists "import equipe" on public.hourly;
create policy "import equipe" on public.hourly for insert to authenticated with check (true);
drop policy if exists "maj equipe" on public.hourly;
create policy "maj equipe" on public.hourly for update to authenticated using (true) with check (true);
