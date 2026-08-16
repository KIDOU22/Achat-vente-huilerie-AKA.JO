-- Huilerie Aka.Jo — fusionne les doublons des caisses "singleton" (principale,
-- banque) accumulés côté cloud. 0012/0013 ne dédupliquaient que les caisses
-- "secondaire" (une par utilisateur) : la fusion des caisses principale/banque
-- n'a toujours été faite que localement sur chaque appareil (voir
-- fusionnerCaissesUniquesEnDouble dans le code), avec un nettoyage cloud best-effort
-- qui n'a manifestement pas suivi à chaque fois — probablement à chaque réinstallation
-- forcée par le bug de plantage au démarrage (corrigé séparément), qui repartait
-- d'une base locale vide et recréait une caisse "principale"/"banque" avant d'avoir
-- pu retrouver celle déjà existante sur Supabase.
--
-- Garde la plus ancienne caisse de chaque type (celle qui porte l'historique réel des
-- mouvements), réattribue les mouvements des autres vers elle, puis supprime les
-- doublons. Sans effet si aucun doublon — peut être ré-exécuté sans risque.
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

do $$
declare
  keep_id uuid;
  t text;
begin
  foreach t in array array['principale', 'banque']
  loop
    select id into keep_id from public.caisses
      where type = t
      order by created_at asc limit 1;
    if keep_id is not null then
      update public.mouvements_caisse set caisse_from_id = keep_id
        where caisse_from_id in (
          select id from public.caisses where type = t and id != keep_id
        );
      update public.mouvements_caisse set caisse_to_id = keep_id
        where caisse_to_id in (
          select id from public.caisses where type = t and id != keep_id
        );
      delete from public.caisses where type = t and id != keep_id;
    end if;
  end loop;
end $$;
