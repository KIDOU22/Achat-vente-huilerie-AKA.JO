-- Huilerie Aka.Jo — ajoute le rôle "dirigeant" (accès identique au Gérant en
-- lecture, annulation et prix ; pas de gestion des comptes ni des caisses)
-- À exécuter après 0006_dedup_caisses.sql : Dashboard > SQL Editor > New query > coller > Run

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('gerant', 'dirigeant', 'agent'));

create or replace function public.is_elevated()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) in ('gerant', 'dirigeant'), false);
$$;

-- Visibilité étendue au dirigeant (comme le gérant) : prix huile, ventes
-- complètes, mouvements de caisse, journal d'audit, et modification des prix.
-- La gestion des comptes (profiles_update) reste strictement réservée au
-- gérant (is_gerant(), inchangé).
drop policy if exists "settings_select" on public.settings;
create policy "settings_select" on public.settings
  for select using (key in ('prixKg', 'prixTransportRegime') or public.is_elevated());

drop policy if exists "settings_insert" on public.settings;
create policy "settings_insert" on public.settings
  for insert with check (public.is_elevated());

drop policy if exists "settings_update" on public.settings;
create policy "settings_update" on public.settings
  for update using (public.is_elevated());

drop policy if exists "ventes_select_gerant" on public.ventes;
create policy "ventes_select_gerant" on public.ventes
  for select using (public.is_elevated());

drop policy if exists "ventes_update" on public.ventes;
create policy "ventes_update" on public.ventes
  for update using (public.is_elevated());

drop policy if exists "audit_select_gerant" on public.audit_log;
create policy "audit_select_gerant" on public.audit_log
  for select using (public.is_elevated());

drop policy if exists "mouvements_select" on public.mouvements_caisse;
create policy "mouvements_select" on public.mouvements_caisse
  for select using (
    public.is_elevated()
    or exists (
      select 1 from public.caisses c
      where c.id in (mouvements_caisse.caisse_from_id, mouvements_caisse.caisse_to_id)
        and c.owner_identifiant = public.my_identifiant()
    )
  );
