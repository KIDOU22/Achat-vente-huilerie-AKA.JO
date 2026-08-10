-- Huilerie Aka.Jo — caisses (principale + secondaires) et mouvements de caisse
-- À exécuter après 0001_init.sql : Dashboard > SQL Editor > New query > coller > Run

drop table if exists public.mouvements_caisse cascade;
drop table if exists public.caisses cascade;
drop function if exists public.my_identifiant() cascade;

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

-- ============================================================
-- CAISSES — une "principale" (owner_identifiant null) + une "secondaire" par
-- utilisateur (agent ou gérant), reliée par identifiant.
-- ============================================================
create table public.caisses (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('principale', 'secondaire')),
  owner_identifiant text,
  created_at timestamptz not null default now()
);

alter table public.caisses enable row level security;

-- La table caisses ne contient aucune donnée financière (ni solde, ni montant) —
-- juste l'existence/le propriétaire d'une caisse. Visible par tout utilisateur
-- connecté, pour permettre de choisir un destinataire lors d'une allocation ou d'un
-- transfert. Les montants réels ne sont accessibles que via mouvements_caisse
-- (voir plus bas), qui applique la vraie règle de confidentialité.
create policy "caisses_select" on public.caisses
  for select using (auth.role() = 'authenticated');

create policy "caisses_insert" on public.caisses
  for insert with check (auth.role() = 'authenticated');

-- Permet le "upsert" (la synchro repousse périodiquement les caisses locales,
-- ce qui déclenche un UPDATE sur les lignes déjà existantes côté serveur).
create policy "caisses_update" on public.caisses
  for update using (auth.role() = 'authenticated');

-- ============================================================
-- MOUVEMENTS DE CAISSE — allocation / dépense / retour / transfert
-- ============================================================
create table public.mouvements_caisse (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('allocation', 'depense', 'retour', 'transfert')),
  caisse_from_id uuid references public.caisses(id),
  caisse_to_id uuid references public.caisses(id),
  montant numeric not null,
  motif text not null default '',
  statut text not null check (statut in ('en_attente', 'validee', 'rejetee')),
  pesee_id uuid,
  created_by text not null,
  created_by_nom text not null,
  validated_by text,
  validated_by_nom text,
  ts timestamptz not null default now(),
  validated_at timestamptz
);

create index idx_mouvements_ts on public.mouvements_caisse(ts desc);

alter table public.mouvements_caisse enable row level security;

-- Visible par le Gérant (tout) ou par un participant (caisse source ou destination
-- lui appartient) — même règle de visibilité que pour les caisses elles-mêmes.
create policy "mouvements_select" on public.mouvements_caisse
  for select using (
    public.is_gerant()
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
-- REALTIME
-- ============================================================
alter publication supabase_realtime add table public.caisses;
alter publication supabase_realtime add table public.mouvements_caisse;
