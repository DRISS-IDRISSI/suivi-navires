-- ============================================================================
-- COMPTES UTILISATEURS : rôles (administrateur / responsable / lecture) et terminaux (TCE / TC3)
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
-- Administrateur initial : d_fellahidrissi@marsamaroc.co.ma (à vérifier : c'est l'e-mail de connexion actuel).
-- Tous les comptes déjà existants sont conservés avec le rôle « responsable » (accès complet sauf gestion des comptes)
-- et devront changer leur mot de passe à la prochaine connexion.
-- Identifiants : les nouveaux comptes se connectent avec un IDENTIFIANT (ex. FELLAH), pas avec un e-mail.
-- ============================================================================

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,          -- e-mail technique de connexion (identifiant@suivi-tc3.invalid pour les comptes à identifiant)
  identifiant text unique,           -- identifiant de connexion en minuscules (ex. fellah) ; null = connexion par e-mail
  nom        text,
  role       text not null default 'lecture' check (role in ('admin','responsable','lecture')),
  terminaux  text[] not null default array['TCE','TC3'],
  actif      boolean not null default true,
  doit_changer_mdp boolean not null default true,   -- vrai tant que l'utilisateur n'a pas choisi son propre mot de passe
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists identifiant text unique;
alter table public.profiles add column if not exists doit_changer_mdp boolean not null default true;
alter table public.profiles enable row level security;

-- l'utilisateur marque lui-même son changement de mot de passe comme fait (seule écriture autorisée sur son profil)
create or replace function public.mdp_change() returns void
language sql security definer set search_path = public as $$
  update public.profiles set doit_changer_mdp = false where user_id = auth.uid()
$$;
revoke all on function public.mdp_change() from public;
grant execute on function public.mdp_change() to authenticated;

-- rôle de l'utilisateur connecté (null si pas de profil ou compte désactivé)
create or replace function public.mon_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid() and actif
$$;
revoke all on function public.mon_role() from public;
grant execute on function public.mon_role() to authenticated;

-- chacun lit son propre profil ; l'administrateur lit tous les profils. Aucune écriture directe :
-- la création / modification passe par la fonction « admin-users » (clé service_role).
drop policy if exists "profil perso" on public.profiles;
create policy "profil perso" on public.profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists "profils admin" on public.profiles;
create policy "profils admin" on public.profiles for select to authenticated using (public.mon_role() = 'admin');

-- comptes existants -> responsable, puis votre compte -> administrateur
insert into public.profiles (user_id, email, role)
select id, coalesce(email, id::text), 'responsable' from auth.users
on conflict (user_id) do nothing;

update public.profiles set role = 'admin' where lower(email) = lower('d_fellahidrissi@marsamaroc.co.ma');
-- sécurité : si l'e-mail ci-dessus ne correspond à rien, le plus ancien compte devient administrateur
update public.profiles set role = 'admin'
where user_id = (select id from auth.users order by created_at limit 1)
  and not exists (select 1 from public.profiles where role = 'admin');

-- ---------------------------------------------------------------------------
-- Droits sur les données : lecture = tout compte actif ; import / modification = administrateur et responsable ;
-- conducteurs (noms et matricules) = administrateur et responsable uniquement.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['snapshots','hourly','rtg_hourly','escale_meta'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists "lecture equipe" on public.%I', t);
      execute format('drop policy if exists "import equipe" on public.%I', t);
      execute format('drop policy if exists "ecriture equipe" on public.%I', t);
      execute format('drop policy if exists "maj equipe" on public.%I', t);
      execute format('create policy "lecture equipe" on public.%I for select to authenticated using (public.mon_role() is not null)', t);
      execute format('create policy "import equipe" on public.%I for insert to authenticated with check (public.mon_role() in (''admin'',''responsable''))', t);
      execute format('create policy "maj equipe" on public.%I for update to authenticated using (public.mon_role() in (''admin'',''responsable'')) with check (public.mon_role() in (''admin'',''responsable''))', t);
    end if;
  end loop;
  if to_regclass('public.driver_shift') is not null then
    drop policy if exists "lecture equipe" on public.driver_shift;
    drop policy if exists "import equipe" on public.driver_shift;
    drop policy if exists "maj equipe" on public.driver_shift;
    create policy "lecture equipe" on public.driver_shift for select to authenticated using (public.mon_role() in ('admin','responsable'));
    create policy "import equipe" on public.driver_shift for insert to authenticated with check (public.mon_role() in ('admin','responsable'));
    create policy "maj equipe" on public.driver_shift for update to authenticated using (public.mon_role() in ('admin','responsable')) with check (public.mon_role() in ('admin','responsable'));
  end if;
end $$;

-- contrôle : liste des comptes et rôles
select email, identifiant, role, terminaux, actif, doit_changer_mdp from public.profiles order by role, email;
