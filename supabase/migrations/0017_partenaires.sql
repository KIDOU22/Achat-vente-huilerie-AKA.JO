-- Huilerie Aka.Jo — "Partenaires" : la table planteurs couvre désormais aussi les
-- ponts indépendants (autre source de régime) et les chauffeurs (jusqu'ici un simple
-- texte libre sur pesées/ventes, sans fiche ni contact). Ajoute le règlement direct
-- contre le solde global d'un partenaire (avance, paiement en plusieurs fois,
-- règlement groupé de plusieurs livraisons) via mouvements_caisse.partenaire_id.
-- À exécuter AVANT de déployer la nouvelle version de l'app.
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

-- 1. Nouvelles colonnes.
alter table public.planteurs add column if not exists type text not null default 'planteur';
alter table public.planteurs drop constraint if exists planteurs_type_check;
alter table public.planteurs add constraint planteurs_type_check
  check (type in ('planteur', 'pont_independant', 'chauffeur'));
alter table public.planteurs add column if not exists localisation text not null default '—';
alter table public.planteurs add column if not exists responsable text not null default '—';

alter table public.pesees add column if not exists chauffeur_id uuid references public.planteurs(id);
alter table public.ventes add column if not exists chauffeur_id uuid references public.planteurs(id);

alter table public.mouvements_caisse add column if not exists partenaire_id uuid references public.planteurs(id);

-- 2. Crée une fiche "chauffeur" pour chaque nom déjà utilisé en texte libre sur les
-- pesées/ventes existantes (regroupé par nom, insensible à la casse), puis relie ces
-- pesées/ventes à la fiche correspondante.
insert into public.planteurs (id, type, nom, village, tel, localisation, responsable, created_at)
select gen_random_uuid(), 'chauffeur', noms.chauffeur, '—', '—', '—', '—', now()
from (
  select distinct trim(chauffeur) as chauffeur from public.pesees where trim(coalesce(chauffeur, '')) <> ''
  union
  select distinct trim(chauffeur) as chauffeur from public.ventes where trim(coalesce(chauffeur, '')) <> ''
) noms
where not exists (
  select 1 from public.planteurs pl
  where pl.type = 'chauffeur' and lower(trim(pl.nom)) = lower(trim(noms.chauffeur))
);

update public.pesees p
set chauffeur_id = pl.id
from public.planteurs pl
where pl.type = 'chauffeur'
  and lower(trim(pl.nom)) = lower(trim(p.chauffeur))
  and p.chauffeur_id is null;

update public.ventes v
set chauffeur_id = pl.id
from public.planteurs pl
where pl.type = 'chauffeur'
  and lower(trim(pl.nom)) = lower(trim(v.chauffeur))
  and v.chauffeur_id is null;

-- 3. La vue agent expose aussi chauffeur_id (ajouté en fin de liste — Postgres
-- interdit de retirer/réordonner une colonne existante avec CREATE OR REPLACE VIEW).
create or replace view public.ventes_agent_view as
select id, num, num_ticket, client, chauffeur, type_vehicule, immatriculation,
       poids_charge, poids_vide, net, ts, created_by, annulee, annulee_par, motif_annulation, paye,
       paye_huile, paye_transport, chauffeur_id
from public.ventes;

grant select on public.ventes_agent_view to authenticated;
