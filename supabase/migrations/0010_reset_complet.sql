-- Huilerie Aka.Jo — remise à zéro complète après la phase de test
-- ATTENTION : IRRÉVERSIBLE. Supprime TOUTES les données (pesées, ventes,
-- mouvements de caisse, caisses, planteurs, journal d'audit) ET TOUS les comptes
-- (y compris le gérant) côté Supabase. À exécuter UNE SEULE FOIS, juste avant de
-- démarrer les opérations réelles — jamais après, sous peine de perdre les vraies
-- données de production.
-- Dashboard > SQL Editor > New query > coller > Run

delete from public.mouvements_caisse;
delete from public.pesees;
delete from public.ventes;
delete from public.caisses;
delete from public.planteurs;
delete from public.audit_log;
delete from public.profiles;
delete from auth.users;

-- Remet les prix par défaut (ajustez les valeurs si besoin avant de lancer).
insert into public.settings (key, value) values
  ('prixKg', '115'),
  ('prixLitre', '950'),
  ('prixTransportRegime', '10')
on conflict (key) do update set value = excluded.value;
