-- Huilerie Aka.Jo — schéma de synchronisation Supabase
-- À exécuter une seule fois dans Supabase : Dashboard > SQL Editor > New query > coller > Run

create extension if not exists pgcrypto;

-- ============================================================
-- PROFILES (miroir des comptes utilisateurs, liés à Supabase Auth)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  identifiant text unique not null,
  nom text not null,
  role text not null check (role in ('gerant', 'agent')),
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
-- SETTINGS (prix du jour) — régime visible par tous, huile réservé au gérant
-- ============================================================
create table public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "settings_select" on public.settings
  for select using (key in ('prixKg', 'prixTransportRegime') or public.is_gerant());

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
-- PLANTEURS — lecture/écriture pour tout utilisateur connecté
-- ============================================================
create table public.planteurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  village text not null default '—',
  tel text not null default '—',
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
  paye boolean not null default false,
  ts timestamptz not null default now(),
  created_by uuid not null references public.profiles(id)
);

create index idx_pesees_ts on public.pesees(ts desc);

alter table public.pesees enable row level security;

create policy "pesees_all" on public.pesees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- VENTES (vente huile) — table de base réservée au gérant (prix/montant inclus)
-- ============================================================
create table public.ventes (
  id uuid primary key default gen_random_uuid(),
  num integer not null,
  num_ticket text not null,
  client text not null,
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
  ts timestamptz not null default now(),
  created_by uuid not null references public.profiles(id)
);

create index idx_ventes_ts on public.ventes(ts desc);

alter table public.ventes enable row level security;

create policy "ventes_select_gerant" on public.ventes
  for select using (public.is_gerant());

create policy "ventes_insert" on public.ventes
  for insert with check (auth.role() = 'authenticated');

-- Vue sans les colonnes financières : permet aux agents de voir l'historique des
-- ventes (client, poids, véhicule...) sans jamais accéder au prix/montant/transport.
create or replace view public.ventes_agent_view as
select id, num, num_ticket, client, chauffeur, type_vehicule, immatriculation,
       poids_charge, poids_vide, net, ts, created_by
from public.ventes;

grant select on public.ventes_agent_view to authenticated;

-- ============================================================
-- AUDIT LOG — lecture réservée au gérant, écriture pour tout utilisateur connecté
-- ============================================================
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  user_id uuid not null references public.profiles(id),
  user_nom text not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  details text not null default ''
);

alter table public.audit_log enable row level security;

create policy "audit_select_gerant" on public.audit_log
  for select using (public.is_gerant());

create policy "audit_insert" on public.audit_log
  for insert with check (auth.role() = 'authenticated');

-- ============================================================
-- REALTIME — remontée en direct des pesées/ventes/planteurs
-- (Supabase Realtime applique les mêmes règles RLS par abonné : un agent ne
-- recevra jamais d'événement contenant des données de vente masquées.)
-- ============================================================
alter publication supabase_realtime add table public.planteurs;
alter publication supabase_realtime add table public.pesees;
alter publication supabase_realtime add table public.ventes;
