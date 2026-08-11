-- Huilerie Aka.Jo — ajoute le type de mouvement "apport" (dépôt externe dans une caisse)
-- À exécuter après 0003_annulation.sql : Dashboard > SQL Editor > New query > coller > Run

alter table public.mouvements_caisse drop constraint if exists mouvements_caisse_type_check;
alter table public.mouvements_caisse add constraint mouvements_caisse_type_check
  check (type in ('allocation', 'depense', 'retour', 'transfert', 'apport'));
