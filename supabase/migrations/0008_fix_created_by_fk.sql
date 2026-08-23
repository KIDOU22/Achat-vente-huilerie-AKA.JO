-- Huilerie Aka.Jo — supprime une ancienne contrainte de clé étrangère restée sur
-- created_by/user_id/validated_by (censée être un simple texte, jamais une
-- référence à profiles.id — l'id local de l'app et l'UID Supabase Auth vivent
-- dans des espaces différents). Cette contrainte bloquait tout envoi de pesée.
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

alter table public.pesees drop constraint if exists pesees_created_by_fkey;
alter table public.ventes drop constraint if exists ventes_created_by_fkey;
alter table public.audit_log drop constraint if exists audit_log_user_id_fkey;
alter table public.mouvements_caisse drop constraint if exists mouvements_caisse_created_by_fkey;
alter table public.mouvements_caisse drop constraint if exists mouvements_caisse_validated_by_fkey;
