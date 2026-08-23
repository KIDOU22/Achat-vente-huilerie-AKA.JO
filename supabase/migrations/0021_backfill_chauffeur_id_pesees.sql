-- Huilerie Aka.Jo — répare les pesées dont chauffeur_id n'a jamais été renseigné :
-- des pesées créées localement avant l'exécution de la migration 0017 (donc pas
-- encore synchronisées à ce moment-là) sont arrivées plus tard dans le cloud avec
-- chauffeur_id resté NULL, sans qu'aucune réconciliation ultérieure ne les rattrape —
-- elles n'apparaissent alors dans aucune fiche chauffeur en Synthèse, alors que le nom
-- est bien présent en texte libre (visible dans Historique). Rejoue le même principe
-- que 0017 (créer la fiche manquante si besoin, puis relier), idempotent — sans effet
-- si rien à réparer.
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

insert into public.planteurs (id, type, nom, village, tel, localisation, responsable, created_at)
select gen_random_uuid(), 'chauffeur', noms.chauffeur, '—', '—', '—', '—', now()
from (
  select distinct trim(chauffeur) as chauffeur from public.pesees
  where trim(coalesce(chauffeur, '')) <> '' and chauffeur_id is null
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
