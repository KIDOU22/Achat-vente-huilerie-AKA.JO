-- Huilerie Aka.Jo — le chauffeur d'une vente reste un texte libre (souvent le
-- camion/chauffeur du client lui-même, ex. "Citerne client"), contrairement à
-- l'achat où c'est toujours un chauffeur de la maison choisi dans la liste des
-- partenaires. Annule l'ajout de ventes.chauffeur_id fait par 0017 (0017 avait
-- traité vente et achat de la même façon, à corriger) — sans effet si 0017 n'a pas
-- encore été exécutée (rien à annuler). N'affecte pas pesees.chauffeur_id, qui reste
-- inchangé.
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

-- La vue dépend de la colonne : elle doit être supprimée AVANT (Postgres refuse de
-- droper une colonne encore référencée par une vue), puis recréée. Redéfinition
-- complète (pas CREATE OR REPLACE) : retirer une colonne existante d'une vue exige
-- de la recréer, Postgres interdit un simple remplacement dans ce cas.
drop view if exists public.ventes_agent_view;

alter table public.ventes drop column if exists chauffeur_id;

create view public.ventes_agent_view as
select id, num, num_ticket, client, chauffeur, type_vehicule, immatriculation,
       poids_charge, poids_vide, net, ts, created_by, annulee, annulee_par, motif_annulation, paye,
       paye_huile, paye_transport
from public.ventes;

grant select on public.ventes_agent_view to authenticated;
