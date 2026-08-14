-- Huilerie Aka.Jo — création complète du schéma sur un PROJET SUPABASE NEUF
-- (utile pour un environnement de démo/test, séparé de la production).
-- Regroupe en un seul script l'état final de toutes les migrations
-- 0001 à 0018 (supabase/migrations/) — inutile de les rejouer une par une sur un
-- projet neuf. Sans effet destructeur si rejoué : repart d'une base propre si les
-- tables existent déjà (comme 0001_init.sql).
-- À exécuter UNE SEULE FOIS, juste après avoir créé le projet Supabase :
-- Dashboard > SQL Editor > New query > coller > Run

create extension if not exists pgcrypto;

drop view if exists public.ventes_agent_view cascade;
drop table if exists public.local_accounts cascade;
drop table if exists public.mouvements_caisse cascade;
drop table if exists public.caisses cascade;
drop table if exists public.audit_log cascade;
drop table if exists public.ventes cascade;
drop table if exists public.pesees cascade;
drop table if exists public.planteurs cascade;
drop table if exists public.settings cascade;
drop table if exists public.profiles cascade;
drop function if exists public.is_gerant() cascade;
drop function if exists public.is_elevated() cascade;
drop function if exists public.my_identifiant() cascade;

-- ============================================================
-- PROFILES (miroir des comptes utilisateurs, liés à Supabase Auth)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  identifiant text unique not null,
  nom text not null,
  role text not null check (role in ('gerant', 'dirigeant', 'agent')),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.is_gerant()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'gerant', false);
$$;

-- Voit tout ce que voit le gérant (prix, ventes complètes, caisses, audit) mais ne
-- gère jamais les comptes (réservé à is_gerant()).
create or replace function public.is_elevated()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) in ('gerant', 'dirigeant'), false);
$$;

-- Traduit auth.uid() en identifiant local (les caisses sont liées par identifiant,
-- car l'id local SQLite et l'UID Supabase Auth vivent dans des espaces différents).
create or replace function public.my_identifiant()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select identifiant from public.profiles where id = auth.uid();
$$;

alter table public.profiles enable row level security;

create policy "profiles_select" on public.profiles
  for select using (id = auth.uid() or public.is_gerant());

-- Bootstrap : autorise la création du tout premier compte (gérant) tant qu'aucun
-- gérant n'existe encore ; ensuite, seul un gérant peut créer/modifier des comptes.
create policy "profiles_insert" on public.profiles
  for insert with check (
    public.is_gerant() or not exists (select 1 from public.profiles where role = 'gerant')
  );

create policy "profiles_update" on public.profiles
  for update using (public.is_gerant());

-- ============================================================
-- SETTINGS (prix du jour) — régime visible par tous, huile réservé au gérant/dirigeant
-- ============================================================
create table public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "settings_select" on public.settings
  for select using (key in ('prixKg', 'prixTransportRegime') or public.is_elevated());

-- Seul le gérant modifie les prix ; le dirigeant les voit (settings_select
-- ci-dessus, ouvert via is_elevated()) mais ne peut pas les écrire.
create policy "settings_insert" on public.settings
  for insert with check (public.is_gerant());

create policy "settings_update" on public.settings
  for update using (public.is_gerant());

insert into public.settings (key, value) values
  ('prixKg', '115'),
  ('prixLitre', '950'),
  ('prixTransportRegime', '10')
on conflict (key) do nothing;

-- ============================================================
-- PLANTEURS — lecture/écriture/suppression pour tout utilisateur connecté
-- ============================================================
create table public.planteurs (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'planteur' check (type in ('planteur', 'pont_independant', 'chauffeur')),
  nom text not null,
  village text not null default '—',
  tel text not null default '—',
  localisation text not null default '—',
  responsable text not null default '—',
  created_at timestamptz not null default now()
);

alter table public.planteurs enable row level security;

create policy "planteurs_all" on public.planteurs
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- PESEES (achats de régimes) — visibles par tous, prix inclus
-- ============================================================
create table public.pesees (
  id uuid primary key default gen_random_uuid(),
  num integer not null,
  num_ticket text not null,
  planteur_id uuid not null references public.planteurs(id),
  chauffeur text not null,
  chauffeur_id uuid references public.planteurs(id),
  type_vehicule text not null,
  immatriculation text not null,
  origine text not null default '—',
  poids_charge numeric not null,
  poids_vide numeric not null,
  net numeric not null,
  prix_kg numeric not null,
  montant numeric not null,
  prix_transport_kg numeric not null default 0,
  montant_transport numeric not null default 0,
  paye_regime boolean not null default false,
  paye_transport boolean not null default false,
  ts timestamptz not null default now(),
  created_by text not null,
  annulee boolean not null default false,
  annulee_par text,
  motif_annulation text
);

create index idx_pesees_ts on public.pesees(ts desc);

alter table public.pesees enable row level security;

create policy "pesees_all" on public.pesees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- VENTES (vente huile) — table de base réservée au gérant/dirigeant (prix inclus)
-- ============================================================
create table public.ventes (
  id uuid primary key default gen_random_uuid(),
  num integer not null,
  num_ticket text not null,
  client text not null,
  -- Texte libre, volontairement pas relié à un partenaire chauffeur (souvent le
  -- camion du client lui-même) — contrairement à pesees.chauffeur_id.
  chauffeur text not null,
  type_vehicule text not null,
  immatriculation text not null,
  poids_charge numeric not null,
  poids_vide numeric not null,
  net numeric not null,
  prix_litre numeric not null,
  montant numeric not null,
  prix_transport_kg numeric not null default 0,
  montant_transport numeric not null default 0,
  paye_huile boolean not null default false,
  paye_transport boolean not null default false,
  ts timestamptz not null default now(),
  created_by text not null,
  annulee boolean not null default false,
  annulee_par text,
  motif_annulation text
);

create index idx_ventes_ts on public.ventes(ts desc);

alter table public.ventes enable row level security;

create policy "ventes_select_gerant" on public.ventes
  for select using (public.is_elevated());

create policy "ventes_insert" on public.ventes
  for insert with check (auth.role() = 'authenticated');

create policy "ventes_update" on public.ventes
  for update using (public.is_elevated());

-- Vue sans les colonnes financières : permet aux agents de voir l'historique des
-- ventes (client, poids, véhicule, statut d'annulation...) sans jamais accéder au
-- prix/montant/transport.
create or replace view public.ventes_agent_view as
select id, num, num_ticket, client, chauffeur, type_vehicule, immatriculation,
       poids_charge, poids_vide, net, ts, created_by, annulee, annulee_par, motif_annulation,
       paye_huile, paye_transport
from public.ventes;

grant select on public.ventes_agent_view to authenticated;

-- ============================================================
-- AUDIT LOG — lecture réservée au gérant/dirigeant, écriture pour tout utilisateur connecté
-- ============================================================
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  user_id text not null,
  user_nom text not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  details text not null default ''
);

alter table public.audit_log enable row level security;

create policy "audit_select_gerant" on public.audit_log
  for select using (public.is_elevated());

create policy "audit_insert" on public.audit_log
  for insert with check (auth.role() = 'authenticated');

-- ============================================================
-- CAISSES — une "principale" + une "banque" (owner_identifiant null) + une
-- "secondaire" par utilisateur, reliée par identifiant.
-- ============================================================
create table public.caisses (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('principale', 'secondaire', 'banque')),
  owner_identifiant text,
  created_at timestamptz not null default now()
);

alter table public.caisses enable row level security;

-- La table caisses ne contient aucune donnée financière (ni solde, ni montant) —
-- juste l'existence/le propriétaire d'une caisse. Visible par tout utilisateur
-- connecté. Les montants réels ne sont accessibles que via mouvements_caisse.
create policy "caisses_select" on public.caisses
  for select using (auth.role() = 'authenticated');

create policy "caisses_insert" on public.caisses
  for insert with check (auth.role() = 'authenticated');

create policy "caisses_update" on public.caisses
  for update using (auth.role() = 'authenticated');

create policy "caisses_delete" on public.caisses
  for delete using (auth.role() = 'authenticated');

-- ============================================================
-- MOUVEMENTS DE CAISSE — allocation / dépense / retour / transfert / apport
-- ============================================================
create table public.mouvements_caisse (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('allocation', 'depense', 'retour', 'transfert', 'apport')),
  caisse_from_id uuid references public.caisses(id),
  caisse_to_id uuid references public.caisses(id),
  montant numeric not null,
  motif text not null default '',
  statut text not null check (statut in ('en_attente', 'validee', 'rejetee')),
  pesee_id uuid,
  vente_id uuid,
  partenaire_id uuid references public.planteurs(id),
  volet text check (volet is null or volet in ('produit', 'transport')),
  created_by text not null,
  created_by_nom text not null,
  validated_by text,
  validated_by_nom text,
  ts timestamptz not null default now(),
  validated_at timestamptz
);

create index idx_mouvements_ts on public.mouvements_caisse(ts desc);

alter table public.mouvements_caisse enable row level security;

-- Visible par le gérant/dirigeant (tout) ou par un participant (caisse source ou
-- destination lui appartient).
create policy "mouvements_select" on public.mouvements_caisse
  for select using (
    public.is_elevated()
    or exists (
      select 1 from public.caisses c
      where c.id in (mouvements_caisse.caisse_from_id, mouvements_caisse.caisse_to_id)
        and c.owner_identifiant = public.my_identifiant()
    )
  );

create policy "mouvements_insert" on public.mouvements_caisse
  for insert with check (auth.role() = 'authenticated');

create policy "mouvements_update" on public.mouvements_caisse
  for update using (auth.role() = 'authenticated');

-- ============================================================
-- LOCAL_ACCOUNTS — synchronise les comptes (identifiant/code) entre appareils,
-- pour qu'un compte créé par le gérant fonctionne dès la première connexion sur
-- le téléphone de son titulaire.
-- ============================================================
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
create policy "local_accounts_select" on public.local_accounts
  for select using (true);

create policy "local_accounts_insert" on public.local_accounts
  for insert with check (public.is_gerant());

create policy "local_accounts_update" on public.local_accounts
  for update using (public.is_gerant());

-- ============================================================
-- REALTIME — remontée en direct des changements vers tous les appareils connectés
-- ============================================================
alter publication supabase_realtime add table public.planteurs;
alter publication supabase_realtime add table public.pesees;
alter publication supabase_realtime add table public.ventes;
alter publication supabase_realtime add table public.caisses;
alter publication supabase_realtime add table public.mouvements_caisse;
alter publication supabase_realtime add table public.local_accounts;
