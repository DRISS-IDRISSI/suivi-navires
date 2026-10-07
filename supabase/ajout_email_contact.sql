-- Ajout de l'adresse e-mail de contact (information seulement, ne sert pas à la connexion)
alter table public.profiles add column if not exists email_contact text;
select email, identifiant, email_contact, role from public.profiles order by role, email;
