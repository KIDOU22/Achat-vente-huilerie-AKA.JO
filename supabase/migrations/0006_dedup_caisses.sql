-- Huilerie Aka.Jo — fusionne les doublons de caisses "principale"/"banque"
-- (créées séparément par différentes installations avant que la synchro ne
-- fonctionne). Garde la plus ancienne de chaque, réattribue ses mouvements,
-- supprime les autres. Sans effet si un seul exemplaire de chaque existe déjà —
-- peut être ré-exécuté sans risque.
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

do $$
declare
  keep_id uuid;
  t text;
begin
  foreach t in array array['principale', 'banque'] loop
    select id into keep_id from public.caisses where type = t order by created_at asc limit 1;
    if keep_id is not null then
      update public.mouvements_caisse set caisse_from_id = keep_id
        where caisse_from_id in (select id from public.caisses where type = t and id != keep_id);
      update public.mouvements_caisse set caisse_to_id = keep_id
        where caisse_to_id in (select id from public.caisses where type = t and id != keep_id);
      delete from public.caisses where type = t and id != keep_id;
    end if;
  end loop;
end $$;
