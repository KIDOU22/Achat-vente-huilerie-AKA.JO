-- Huilerie Aka.Jo — paiement des ventes d'huile : le vendeur peut désormais marquer
-- une vente comme payée et choisir la caisse qui reçoit les fonds (principale ou
-- banque). Ajoute la colonne de statut sur "ventes" et le lien vers la vente sur
-- "mouvements_caisse" (même principe que pesee_id pour le paiement d'une pesée).
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

alter table public.ventes add column if not exists paye boolean not null default false;
alter table public.mouvements_caisse add column if not exists vente_id uuid;

-- La vue agent doit aussi exposer le statut de paiement (sans données financières).
create or replace view public.ventes_agent_view as
select id, num, num_ticket, client, chauffeur, type_vehicule, immatriculation,
       poids_charge, poids_vide, net, ts, created_by, paye, annulee, annulee_par, motif_annulation
from public.ventes;
