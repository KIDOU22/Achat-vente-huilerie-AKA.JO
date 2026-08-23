-- Huilerie Aka.Jo — synchronise les comptes utilisateurs (identifiant/code d'accès
-- local) entre appareils. Sans cette table, un compte créé par le gérant sur son
-- téléphone (écran "Comptes utilisateurs") n'existait que localement sur cet
-- appareil : un agent essayant de se connecter la toute première fois sur son
-- PROPRE téléphone échouait toujours, même avec le bon identifiant/code.
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

create table public.local_accounts (
  id uuid primary key,
  identifiant text unique not null,
  code_hash text not null,
  nom text not null,
  role text not null check (role in ('gerant', 'dirigeant', 'agent')),
  actif boolean not null default true,
  doit_changer_code boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.local_accounts enable row level security;

-- Lecture volontairement publique (pas de "authenticated" requis) : un tout nouveau
-- téléphone doit pouvoir vérifier un identifiant/code fourni par le gérant AVANT
-- toute première connexion réussie (donc avant d'avoir la moindre session Supabase).
-- Les codes sont de courts codes numériques pensés comme provisoires — remplacés par
-- l'agent lui-même dès sa première connexion — la vraie protection de cette appli est
-- la possession du téléphone/identifiant, pas la confidentialité du hash.
create policy "local_accounts_select" on public.local_accounts
  for select using (true);

create policy "local_accounts_insert" on public.local_accounts
  for insert with check (public.is_gerant());

create policy "local_accounts_update" on public.local_accounts
  for update using (public.is_gerant());

alter publication supabase_realtime add table public.local_accounts;
