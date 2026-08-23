-- Huilerie Aka.Jo — annulation des pesées/ventes (réservée au Gérant côté app)
-- À exécuter après 0002_caisses.sql : Dashboard > SQL Editor > New query > coller > Run

alter table public.pesees add column if not exists annulee boolean not null default false;
alter table public.pesees add column if not exists annulee_par text;
alter table public.pesees add column if not exists motif_annulation text;

alter table public.ventes add column if not exists annulee boolean not null default false;
alter table public.ventes add column if not exists annulee_par text;
alter table public.ventes add column if not exists motif_annulation text;

-- La table ventes n'avait qu'une politique select (gérant) + insert (tous) : sans
-- politique update, l'annulation (réservée au gérant) échouerait silencieusement.
drop policy if exists "ventes_update" on public.ventes;
create policy "ventes_update" on public.ventes
  for update using (public.is_gerant());

-- La vue agent doit aussi exposer le statut d'annulation (sans données financières).
create or replace view public.ventes_agent_view as
select id, num, num_ticket, client, chauffeur, type_vehicule, immatriculation,
       poids_charge, poids_vide, net, ts, created_by, annulee, annulee_par, motif_annulation
from public.ventes;
