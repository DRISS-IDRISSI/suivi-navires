-- Postes à quai saisis dans l'application (clic sur "poste à renseigner")
create table if not exists public.escale_meta (
  visit text primary key,
  poste text,
  updated_at timestamptz default now()
);
alter table public.escale_meta enable row level security;
drop policy if exists "lecture equipe" on public.escale_meta;
drop policy if exists "ecriture equipe" on public.escale_meta;
drop policy if exists "maj equipe" on public.escale_meta;
create policy "lecture equipe" on public.escale_meta for select to authenticated using (true);
create policy "ecriture equipe" on public.escale_meta for insert to authenticated with check (true);
create policy "maj equipe" on public.escale_meta for update to authenticated using (true) with check (true);
