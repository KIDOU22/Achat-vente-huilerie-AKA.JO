-- Huilerie Aka.Jo — paiement séparé : le régime/l'huile et le transport se paient
-- désormais chacun indépendamment (l'un peut être payé bien avant l'autre — ex. le
-- chauffeur récupère son dû immédiatement, le planteur en fin de mois pour toutes
-- ses livraisons). Remplace le statut "payé" unique par deux drapeaux par pesée/vente,
-- et scinde en deux le mouvement de caisse combiné déjà enregistré (s'il y en a).
--
-- IMPORTANT : à exécuter AVANT de déployer la nouvelle version de l'app (celle-ci
-- suppose que la scission ci-dessous a déjà eu lieu — c'est le SEUL endroit où elle
-- se fait, une fois, pour éviter tout risque de doublon si chaque téléphone tentait
-- de la refaire de son côté).
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

-- 1. Nouvelles colonnes.
alter table public.pesees add column if not exists paye_regime boolean not null default false;
alter table public.pesees add column if not exists paye_transport boolean not null default false;
alter table public.ventes add column if not exists paye_huile boolean not null default false;
alter table public.ventes add column if not exists paye_transport boolean not null default false;
alter table public.mouvements_caisse add column if not exists volet text;
alter table public.mouvements_caisse drop constraint if exists mouvements_caisse_volet_check;
alter table public.mouvements_caisse add constraint mouvements_caisse_volet_check
  check (volet is null or volet in ('produit', 'transport'));

-- 2. Reprend l'ancien statut "payé" (unique) pour initialiser les deux drapeaux.
update public.pesees set paye_regime = true, paye_transport = true where paye = true;
update public.ventes set paye_huile = true, paye_transport = true where paye = true;

-- 3. Scinde le mouvement combiné d'une pesée payée (dépense) : la ligne existante
-- devient le volet "régime" (montant réduit à pesees.montant), et on crée le volet
-- "transport" séparément (même caisse, même auteur) s'il y a un coût de transport.
update public.mouvements_caisse m
  set montant = p.montant, volet = 'produit'
  from public.pesees p
  where m.pesee_id = p.id and m.type = 'depense' and m.volet is null;

insert into public.mouvements_caisse
  (id, type, caisse_from_id, caisse_to_id, montant, motif, statut, pesee_id, created_by, created_by_nom,
   validated_by, validated_by_nom, ts, validated_at, volet)
select gen_random_uuid(), 'depense', m.caisse_from_id, null, p.montant_transport, 'Paiement pesée — transport',
       'validee', p.id, m.created_by, m.created_by_nom, m.validated_by, m.validated_by_nom, m.ts, m.validated_at, 'transport'
from public.mouvements_caisse m
join public.pesees p on p.id = m.pesee_id
where m.type = 'depense' and m.volet = 'produit' and p.montant_transport > 0
  and not exists (select 1 from public.mouvements_caisse m2 where m2.pesee_id = p.id and m2.volet = 'transport');

-- 4. Même principe pour une vente payée (crédit huile). Le transport d'une vente est
-- un COÛT (voir "prix de revient" dans l'écran Vente) : reconstitué ici comme une
-- dépense débitant la même caisse que celle qui a reçu la recette huile.
update public.mouvements_caisse m
  set montant = v.montant, volet = 'produit'
  from public.ventes v
  where m.vente_id = v.id and m.type = 'apport' and m.volet is null;

insert into public.mouvements_caisse
  (id, type, caisse_from_id, caisse_to_id, montant, motif, statut, vente_id, created_by, created_by_nom,
   validated_by, validated_by_nom, ts, validated_at, volet)
select gen_random_uuid(), 'depense', m.caisse_to_id, null, v.montant_transport, 'Paiement transport vente huile',
       'validee', v.id, m.created_by, m.created_by_nom, m.validated_by, m.validated_by_nom, m.ts, m.validated_at, 'transport'
from public.mouvements_caisse m
join public.ventes v on v.id = m.vente_id
where m.type = 'apport' and m.volet = 'produit' and v.montant_transport > 0
  and not exists (select 1 from public.mouvements_caisse m2 where m2.vente_id = v.id and m2.volet = 'transport');

-- 5. La vue agent doit aussi exposer les deux nouveaux statuts (sans données
-- financières). Postgres interdit de retirer/réordonner une colonne existante avec
-- CREATE OR REPLACE VIEW (seul un ajout en fin de liste est permis) : "paye" reste
-- donc dans la vue (obsolète côté app, sans impact) et les deux nouvelles colonnes
-- sont ajoutées à la fin.
create or replace view public.ventes_agent_view as
select id, num, num_ticket, client, chauffeur, type_vehicule, immatriculation,
       poids_charge, poids_vide, net, ts, created_by, annulee, annulee_par, motif_annulation, paye,
       paye_huile, paye_transport
from public.ventes;

grant select on public.ventes_agent_view to authenticated;
