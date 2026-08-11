-- Huilerie Aka.Jo — ajoute le type de caisse "banque" (visible du Gérant uniquement)
-- À exécuter après 0004_apport.sql : Dashboard > SQL Editor > New query > coller > Run

alter table public.caisses drop constraint if exists caisses_type_check;
alter table public.caisses add constraint caisses_type_check
  check (type in ('principale', 'secondaire', 'banque'));
